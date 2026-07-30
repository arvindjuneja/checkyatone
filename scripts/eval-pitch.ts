/**
 * Harness ewaluacyjny detektora F0.
 *
 * Uruchomienie: npm run eval
 *
 * Sygnały syntetyczne z idealnym ground truth — jedyny sposób, żeby odróżnić
 * "detektor się poprawił" od "błąd przesunął się gdzie indziej". Metodyka jak
 * u weryfikatora audytu (#103): 8 harmonicznych o amplitudzie 1/n.
 *
 * Metryki:
 *   RPA      — % ramek w tolerancji ±50 centów
 *   OCT      — % ramek, gdzie stosunek detekcji do prawdy to 2,3,4 lub 1/2,1/3,1/4
 *   med|err| — mediana modułu błędu w centach, liczona po ramkach BEZ błędu oktawowego
 */

import { detectPitch, resetPitchTracking, noteToFrequency } from "../lib/pitch-detector"
import { detectPitchPro, resetProPitchTracking } from "../lib/pitch-detector-pro"

// ----- Generator sygnału -----

interface ToneOptions {
  harmonics?: number
  /** Pomija pierwszą harmoniczną — pułapka oktawowa (telefon, mały głośnik). */
  missingFundamental?: boolean
  /** SNR w dB; pomijane, gdy undefined. */
  snrDb?: number
  /** Głębokość vibrata w centach. */
  vibratoCents?: number
  vibratoHz?: number
}

/** Deterministyczny PRNG — szum musi być powtarzalny między przebiegami. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function synthesizeTone(
  f0: number,
  sampleRate: number,
  length: number,
  startPhaseSeconds = 0,
  options: ToneOptions = {},
): Float32Array {
  const {
    harmonics = 8,
    missingFundamental = false,
    snrDb,
    vibratoCents = 0,
    vibratoHz = 6,
  } = options

  const buffer = new Float32Array(length)
  const firstHarmonic = missingFundamental ? 2 : 1

  // Faza całkowana po czasie, żeby vibrato było ciągłe między ramkami.
  let phase = 0
  for (let i = 0; i < length; i++) {
    const t = startPhaseSeconds + i / sampleRate
    const cents = vibratoCents === 0 ? 0 : vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t)
    const instantaneousF0 = f0 * Math.pow(2, cents / 1200)
    phase += (2 * Math.PI * instantaneousF0) / sampleRate

    let sample = 0
    for (let n = firstHarmonic; n <= harmonics; n++) {
      sample += Math.sin(phase * n) / n
    }
    buffer[i] = sample * 0.25
  }

  if (snrDb !== undefined) {
    let signalPower = 0
    for (let i = 0; i < length; i++) signalPower += buffer[i] * buffer[i]
    signalPower /= length

    const noisePower = signalPower / Math.pow(10, snrDb / 10)
    const noiseAmplitude = Math.sqrt(noisePower * 3) // wariancja uniform(-a,a) = a²/3
    const rng = makeRng(0x5eed)
    for (let i = 0; i < length; i++) {
      buffer[i] += (rng() * 2 - 1) * noiseAmplitude
    }
  }

  return buffer
}

// ----- Klasyfikacja błędu -----

const OCTAVE_RATIOS = [2, 3, 4, 1 / 2, 1 / 3, 1 / 4]

function centsError(detected: number, truth: number): number {
  return 1200 * Math.log2(detected / truth)
}

function isOctaveError(detected: number, truth: number): boolean {
  const ratio = detected / truth
  // 3% tolerancji na stosunku ≈ 51 centów, czyli tyle, ile poza RPA.
  return OCTAVE_RATIOS.some((r) => Math.abs(ratio / r - 1) < 0.03)
}

function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ----- Silnik przebiegu -----

type Detector = "basic" | "pro"

function runDetector(
  detector: Detector,
  buffer: Float32Array,
  sampleRate: number,
): number | null {
  const result =
    detector === "basic"
      ? detectPitch(buffer, sampleRate, 0.001)
      : detectPitchPro(buffer, sampleRate, { rmsThreshold: 0.001, voiceProfile: null })
  return result ? result.frequency : null
}

function resetDetector(detector: Detector): void {
  if (detector === "basic") resetPitchTracking()
  else resetProPitchTracking()
}

interface FrameOutcome {
  truth: number
  detected: number | null
}

interface Stats {
  frames: number
  detected: number
  rpa: number
  octaveErrors: number
  medianAbsCents: number
}

function summarize(outcomes: FrameOutcome[]): Stats {
  const detectedOutcomes = outcomes.filter((o) => o.detected !== null)
  let inTolerance = 0
  let octaveErrors = 0
  const cleanErrors: number[] = []

  for (const o of detectedOutcomes) {
    const err = centsError(o.detected!, o.truth)
    if (Math.abs(err) <= 50) inTolerance++
    if (isOctaveError(o.detected!, o.truth)) octaveErrors++
    else cleanErrors.push(Math.abs(err))
  }

  return {
    frames: outcomes.length,
    detected: detectedOutcomes.length,
    rpa: outcomes.length ? (100 * inTolerance) / outcomes.length : 0,
    octaveErrors,
    medianAbsCents: median(cleanErrors),
  }
}

/**
 * Nuta trzymana przez kilka ramek. Pierwsze ramki są pomijane w statystyce —
 * detektory mają stan czasowy i mają prawo się dostroić.
 */
const FRAMES_PER_NOTE = 8
const WARMUP_FRAMES = 2
const BUFFER_SIZE = 2048

function evaluateSustainedNotes(
  detector: Detector,
  notes: { note: string; octave: number }[],
  sampleRate: number,
  options: ToneOptions = {},
): { outcomes: FrameOutcome[]; perNote: { label: string; truth: number; detected: number | null }[] } {
  const outcomes: FrameOutcome[] = []
  const perNote: { label: string; truth: number; detected: number | null }[] = []

  for (const { note, octave } of notes) {
    const truth = noteToFrequency(note, octave)
    resetDetector(detector)

    let lastDetected: number | null = null
    for (let frame = 0; frame < FRAMES_PER_NOTE; frame++) {
      const startSeconds = (frame * BUFFER_SIZE) / sampleRate
      const buffer = synthesizeTone(truth, sampleRate, BUFFER_SIZE, startSeconds, options)
      const detected = runDetector(detector, buffer, sampleRate)
      if (frame >= WARMUP_FRAMES) outcomes.push({ truth, detected })
      lastDetected = detected
    }

    perNote.push({ label: `${note}${octave}`, truth, detected: lastDetected })
  }

  return { outcomes, perNote }
}

/** Skok interwałowy: nuta A trzymana, potem nuta B. Liczy się TYLKO odcinek B. */
function evaluateLeap(
  detector: Detector,
  from: { note: string; octave: number },
  to: { note: string; octave: number },
  sampleRate: number,
): FrameOutcome[] {
  const fromHz = noteToFrequency(from.note, from.octave)
  const toHz = noteToFrequency(to.note, to.octave)
  resetDetector(detector)

  const outcomes: FrameOutcome[] = []
  for (let frame = 0; frame < FRAMES_PER_NOTE; frame++) {
    const startSeconds = (frame * BUFFER_SIZE) / sampleRate
    runDetector(detector, synthesizeTone(fromHz, sampleRate, BUFFER_SIZE, startSeconds), sampleRate)
  }
  for (let frame = 0; frame < FRAMES_PER_NOTE; frame++) {
    const startSeconds = (frame * BUFFER_SIZE) / sampleRate
    const buffer = synthesizeTone(toHz, sampleRate, BUFFER_SIZE, startSeconds)
    const detected = runDetector(detector, buffer, sampleRate)
    if (frame >= WARMUP_FRAMES) outcomes.push({ truth: toHz, detected })
  }
  return outcomes
}

// ----- Zestawy testowe -----

const CHROMATIC_RANGE: { note: string; octave: number }[] = []
for (let midi = 36; midi <= 84; midi += 1) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  CHROMATIC_RANGE.push({ note: names[midi % 12], octave: Math.floor(midi / 12) - 1 })
}

const LEAPS: [{ note: string; octave: number }, { note: string; octave: number }][] = [
  [{ note: "C", octave: 4 }, { note: "C", octave: 5 }],
  [{ note: "C", octave: 5 }, { note: "C", octave: 4 }],
  [{ note: "C", octave: 3 }, { note: "G", octave: 4 }],
  [{ note: "A", octave: 4 }, { note: "A", octave: 3 }],
  [{ note: "E", octave: 3 }, { note: "E", octave: 5 }],
]

function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—"
}

function printStats(label: string, stats: Stats): void {
  const rpa = `${fmt(stats.rpa)}%`.padStart(7)
  const oct = `${stats.octaveErrors}/${stats.detected}`.padStart(8)
  const med = `${fmt(stats.medianAbsCents)}¢`.padStart(8)
  const det = `${fmt((100 * stats.detected) / stats.frames, 0)}%`.padStart(6)
  console.log(`  ${label.padEnd(34)} RPA ${rpa}   oktawy ${oct}   med ${med}   wykryte ${det}`)
}

/**
 * Koszt ramki. Pętla analizy chodzi z requestAnimationFrame na wątku głównym,
 * więc budżet na ramkę przy 60 fps to 16,7 ms — i to na WSZYSTKO, łącznie
 * z rysowaniem.
 */
function measureFrameCost(detector: Detector): number {
  const sampleRate = 48000
  const buffer = synthesizeTone(261.63, sampleRate, BUFFER_SIZE, 0)
  const iterations = 200

  resetDetector(detector)
  for (let i = 0; i < 20; i++) runDetector(detector, buffer, sampleRate) // rozgrzewka JIT

  const start = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) runDetector(detector, buffer, sampleRate)
  const elapsedNs = Number(process.hrtime.bigint() - start)

  return elapsedNs / iterations / 1e6
}

function main(): void {
  const detectors: Detector[] = ["basic", "pro"]

  for (const detector of detectors) {
    console.log(`\n═══ tryb: ${detector.toUpperCase()} ═══`)
    console.log(`  koszt ramki 2048 @ 48 kHz: ${fmt(measureFrameCost(detector), 2)} ms  (budżet 60 fps: 16,7 ms)`)

    for (const sampleRate of [44100, 48000, 96000]) {
      const { outcomes } = evaluateSustainedNotes(detector, CHROMATIC_RANGE, sampleRate)
      printStats(`chromatyka C2–C6 @ ${sampleRate} Hz`, summarize(outcomes))
    }

    const missing = evaluateSustainedNotes(detector, CHROMATIC_RANGE, 48000, {
      missingFundamental: true,
    })
    printStats("bez fundamentalnej (h2–h8)", summarize(missing.outcomes))

    const noisy = evaluateSustainedNotes(detector, CHROMATIC_RANGE, 48000, { snrDb: 20 })
    printStats("szum SNR 20 dB", summarize(noisy.outcomes))

    const vibrato = evaluateSustainedNotes(detector, CHROMATIC_RANGE, 48000, {
      vibratoCents: 50,
      vibratoHz: 6,
    })
    printStats("vibrato 6 Hz ±50¢", summarize(vibrato.outcomes))

    const leapOutcomes = LEAPS.flatMap(([from, to]) => evaluateLeap(detector, from, to, 48000))
    printStats("skoki interwałowe", summarize(leapOutcomes))

    // Rozpiska per nuta — tu widać, GDZIE się łamie.
    const { perNote } = evaluateSustainedNotes(
      detector,
      [
        { note: "C", octave: 2 }, { note: "C", octave: 3 }, { note: "G", octave: 3 },
        { note: "C", octave: 4 }, { note: "E", octave: 4 }, { note: "G", octave: 4 },
        { note: "C", octave: 5 }, { note: "E", octave: 5 }, { note: "A", octave: 5 },
        { note: "C", octave: 6 },
      ],
      48000,
    )
    console.log("  ── kontrolne nuty ──")
    for (const { label, truth, detected } of perNote) {
      const got = detected === null ? "brak" : `${detected.toFixed(2)} Hz`
      const ratio = detected === null ? "" : ` (×${(detected / truth).toFixed(3)})`
      const flag = detected !== null && isOctaveError(detected, truth) ? "  ← OKTAWA" : ""
      console.log(`     ${label.padEnd(4)} ${truth.toFixed(2).padStart(8)} Hz → ${got.padStart(12)}${ratio}${flag}`)
    }
  }
  console.log()
}

main()
