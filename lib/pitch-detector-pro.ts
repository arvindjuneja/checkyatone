/**
 * Pro Pitch Detector: wielohipotezowa detekcja F0.
 *
 * Werdykt o okresowości wydaje rdzeń YIN (lib/yin.ts). Ten moduł dokłada to,
 * czego sama okresowość nie rozstrzyga: kiedy fundamentalna jest słaba lub
 * wycięta (telefon, mały głośnik, filtr górnoprzepustowy), sygnał bywa
 * jednakowo dobrze wyjaśniany przez f0 i przez f0/2.
 *
 * Dwie przesłanki, celowo komplementarne:
 *
 *   OKRESOWOŚĆ (CMNDF w danym tau) wyklucza hipotezy oktawę W GÓRĘ — sygnał
 *   o okresie T nie jest okresowy w T/2.
 *
 *   KOMPLETNOŚĆ SZEREGU HARMONICZNEGO wyklucza hipotezy oktawę W DÓŁ. Przy
 *   prawdziwej fundamentalnej energię niesie każda jej wielokrotność; przy
 *   hipotezie zaniżonej k-krotnie tylko co k-ta.
 *
 * Poprzednia wersja liczyła SUMARYCZNĄ energię harmonicznych i porównywała ją
 * między hipotezami. To nie może działać: szereg harmoniczny f0/2 zawiera cały
 * szereg f0, więc suma dla subharmonicznej jest zawsze większa lub równa.
 * Stąd C4 261,63 Hz odczytywane jako 87,21 Hz.
 *
 * Widmo liczone jest Goertzelem na kilkunastu prążkach zamiast pełnym DFT —
 * poprzednia wersja wołała naiwne DFT 2048-punktowe kosztem 26,9 ms na ramkę,
 * synchronicznie na wątku UI, w trybie domyślnym.
 */

import type { PitchData } from "./pitch-detector"
import { frequencyToNote } from "./pitch-detector"
import {
  applyHannWindow,
  computeRms,
  detectF0,
  goertzelMagnitude,
  MAX_F0_HZ,
  MIN_F0_HZ,
} from "./yin"

// ----- Interfaces -----

export interface PitchCandidate {
  frequency: number
  confidence: number
  harmonicScore: number
  stabilityScore: number
  rangeScore: number
  finalScore: number
}

export interface PitchDataPro extends PitchData {
  candidates?: PitchCandidate[]
  detectionMode: "basic" | "pro"
}

export interface VoiceProfile {
  minF0: number
  maxF0: number
  comfortableF0: number
  sampleCount: number
}

export interface ProDetectorOptions {
  rmsThreshold?: number
  voiceProfile?: VoiceProfile | null
}

// ----- Wagi -----

/**
 * Okresowość i parzystość harmonicznych rozstrzygają. Stabilność czasowa i
 * profil głosu tylko rozbijają remisy — łącznie 0,15, czyli mniej niż typowa
 * różnica między poprawną hipotezą a jej subharmoniczną. To jest celowe:
 * przesłanka „poprzednio było podobnie" nie ma prawa przegłosować pomiaru,
 * bo wtedy pierwszy błąd utrwala się na resztę frazy.
 */
const WEIGHTS = {
  periodicity: 0.5,
  harmonicCompleteness: 0.35,
  temporalStability: 0.1,
  userRangeMatch: 0.05,
}

const STABILITY_WINDOW = 10
let recentF0s: number[] = []

export function resetProPitchTracking() {
  recentF0s = []
}

// ----- Przesłanki -----

const HARMONIC_COUNT = 8
/** Prążek poniżej −26 dB względem najsilniejszej harmonicznej uznajemy za pusty. */
const HARMONIC_PRESENCE_FLOOR = 0.05

/**
 * Kompletność szeregu harmonicznego hipotezy, ważona 1/n.
 *
 * Dla prawdziwej fundamentalnej energię niesie KAŻDA wielokrotność f0. Dla
 * hipotezy zaniżonej k-krotnie energia siedzi tylko w co k-tym prążku, bo
 * pozostałe leżą pomiędzy prawdziwymi harmonicznymi. Waga 1/n sprawia, że brak
 * niskich harmonicznych kosztuje najwięcej.
 *
 * Wartości dla obwiedni 1/n: prawdziwe f0 → 1,00; f0/2 → 0,38; f0/3 → 0,18.
 *
 * Sam stosunek nieparzystych do parzystych tu nie wystarcza: w szeregu
 * nieparzystym hipotezy f0/3 leży samo f0, więc taki test przepuszcza ÷3.
 */
function getHarmonicCompletenessScore(
  windowedBuffer: Float32Array,
  sampleRate: number,
  f0: number,
): number {
  const nyquist = sampleRate / 2
  const magnitudes: number[] = []

  for (let harmonic = 1; harmonic <= HARMONIC_COUNT; harmonic++) {
    const frequency = f0 * harmonic
    magnitudes.push(
      frequency >= nyquist ? 0 : goertzelMagnitude(windowedBuffer, sampleRate, frequency),
    )
  }

  const strongest = Math.max(...magnitudes)
  if (strongest < 1e-9) return 0

  let presentWeight = 0
  let totalWeight = 0
  for (let harmonic = 1; harmonic <= HARMONIC_COUNT; harmonic++) {
    const weight = 1 / harmonic
    totalWeight += weight
    if (magnitudes[harmonic - 1] > strongest * HARMONIC_PRESENCE_FLOOR) presentWeight += weight
  }

  return presentWeight / totalWeight
}

function getTemporalStabilityScore(f0: number): number {
  if (recentF0s.length < 3) return 0.5

  const distances = recentF0s.map((previous) => Math.abs(12 * Math.log2(f0 / previous)))
  const averageDistance = distances.reduce((a, b) => a + b, 0) / distances.length

  return Math.max(0, 1 - averageDistance / 12)
}

function getUserRangeScore(f0: number, profile: VoiceProfile | null): number {
  if (!profile || profile.sampleCount < 50) return 0.5

  if (f0 >= profile.minF0 && f0 <= profile.maxF0) {
    const semitonesFromCenter = Math.abs(12 * Math.log2(f0 / profile.comfortableF0))
    return Math.max(0.3, 1 - semitonesFromCenter / 24)
  }

  const semitonesOutside =
    f0 < profile.minF0
      ? 12 * Math.log2(profile.minF0 / f0)
      : 12 * Math.log2(f0 / profile.maxF0)

  return Math.max(0, 0.3 - semitonesOutside / 12)
}

// ----- Detekcja -----

/**
 * Hipotezy oktawowe wokół werdyktu YIN-a. Mnożniki, nie dowolne kandydatury:
 * błędy detekcji F0 są z definicji błędami o całkowity stosunek okresów.
 */
const OCTAVE_HYPOTHESES = [2, 1, 1 / 2, 1 / 3]

export function detectPitchPro(
  buffer: Float32Array,
  sampleRate: number,
  options: ProDetectorOptions = {},
): { frequency: number; confidence: number; candidates: PitchCandidate[] } | null {
  const { rmsThreshold = 0.001, voiceProfile = null } = options

  if (computeRms(buffer) < rmsThreshold) return null

  const yin = detectF0(buffer, sampleRate, {
    minFrequency: MIN_F0_HZ,
    maxFrequency: MAX_F0_HZ,
  })
  if (!yin) return null

  const { cmndf, analysisSampleRate, frequency: baseFrequency } = yin

  // Okno nakładane raz na ramkę, nie raz na hipotezę.
  const windowedBuffer = applyHannWindow(buffer)
  const scored: PitchCandidate[] = []

  for (const multiplier of OCTAVE_HYPOTHESES) {
    const frequency = baseFrequency * multiplier
    if (frequency < MIN_F0_HZ || frequency > MAX_F0_HZ) continue

    // Okresowość odczytana wprost z CMNDF w tau odpowiadającym hipotezie.
    const tau = Math.round(analysisSampleRate / frequency)
    if (tau < 2 || tau >= cmndf.length) continue
    const periodicity = Math.max(0, 1 - cmndf[tau])

    const harmonicCompleteness = getHarmonicCompletenessScore(windowedBuffer, sampleRate, frequency)
    const stability = getTemporalStabilityScore(frequency)
    const range = getUserRangeScore(frequency, voiceProfile)

    scored.push({
      frequency,
      confidence: periodicity,
      harmonicScore: harmonicCompleteness,
      stabilityScore: stability,
      rangeScore: range,
      finalScore:
        WEIGHTS.periodicity * periodicity +
        WEIGHTS.harmonicCompleteness * harmonicCompleteness +
        WEIGHTS.temporalStability * stability +
        WEIGHTS.userRangeMatch * range,
    })
  }

  if (scored.length === 0) return null

  scored.sort((a, b) => b.finalScore - a.finalScore)
  const winner = scored[0]

  if (winner.confidence < 0.7) return null

  recentF0s.push(winner.frequency)
  if (recentF0s.length > STABILITY_WINDOW) recentF0s.shift()

  return {
    frequency: winner.frequency,
    confidence: winner.confidence,
    candidates: scored.slice(0, 3),
  }
}

/**
 * Full pitch detection with note conversion for Pro mode.
 */
export function detectPitchProWithNote(
  buffer: Float32Array,
  sampleRate: number,
  options: ProDetectorOptions = {},
): PitchDataPro | null {
  const result = detectPitchPro(buffer, sampleRate, options)
  if (!result) return null

  const noteInfo = frequencyToNote(result.frequency)

  return {
    frequency: result.frequency,
    note: noteInfo.note,
    octave: noteInfo.octave,
    cents: noteInfo.cents,
    confidence: result.confidence,
    timestamp: Date.now(),
    candidates: result.candidates,
    detectionMode: "pro",
  }
}
