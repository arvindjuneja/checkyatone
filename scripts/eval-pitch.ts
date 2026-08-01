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
import { applyHannWindow, detectF0, fundamentalPresence } from "../lib/yin"
import { TUNINGS } from "../lib/guitar"

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

/**
 * Szarpana struna gitarowa. Trzy cechy odróżniające od głosu, każda jest
 * osobną pułapką oktawową:
 *
 *  - INHARMONICZNOŚĆ: sztywność struny przesuwa n-tą harmoniczną do
 *    n·f0·√(1+B·n²). Dla stalowej struny B ≈ 1e-4…5e-4. Detektor szukający
 *    idealnych wielokrotności widzi "rozstrojony" szereg.
 *  - OBWIEDNIA CZASOWA: wyższe harmoniczne gasną szybciej, więc pod koniec
 *    wybrzmienia widmo robi się ubogie — inny sygnał niż w ataku.
 *  - MOCNA h2: na niskich strunach druga harmoniczna bywa głośniejsza od
 *    fundamentalnej (rezonans pudła) — klasyczna pułapka oktawy w górę.
 */
function synthesizePluckedString(
  f0: number,
  sampleRate: number,
  length: number,
  /** Czas od szarpnięcia (s) — decyduje, ile harmonicznych jeszcze żyje. */
  timeSincePluck: number,
  inharmonicityB = 3e-4,
  strongSecondHarmonic = false,
): Float32Array {
  const buffer = new Float32Array(length)
  const harmonics = 10

  for (let n = 1; n <= harmonics; n++) {
    const fn = n * f0 * Math.sqrt(1 + inharmonicityB * n * n)
    if (fn >= sampleRate / 2) break

    // Amplituda 1/n^0.8; wyższe harmoniczne gasną szybciej (τ ~ 1/n).
    let amplitude = Math.pow(n, -0.8) * Math.exp(-timeSincePluck * (0.8 + 0.9 * n))
    if (strongSecondHarmonic && n === 2) amplitude *= 2.2
    if (strongSecondHarmonic && n === 1) amplitude *= 0.55

    // Faza deterministyczna, ale nietrywialna — struny nie startują w zerze.
    const phase0 = (n * 2.399963) % (2 * Math.PI)
    for (let i = 0; i < length; i++) {
      const t = timeSincePluck + i / sampleRate
      buffer[i] += amplitude * Math.sin(2 * Math.PI * fn * t + phase0)
    }
  }

  // Normalizacja do sensownego poziomu wejściowego.
  let peak = 0
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(buffer[i]))
  if (peak > 0) for (let i = 0; i < length; i++) buffer[i] = (buffer[i] / peak) * 0.4

  return buffer
}

/**
 * Głos z dominującą drugą harmoniczną — częsty przy mocnej fonacji.
 * Pułapka oktawy W GÓRĘ: energia sugeruje 2·f0, okresowość mówi f0.
 */
function synthesizeStrongH2Voice(
  f0: number,
  sampleRate: number,
  length: number,
  startPhaseSeconds: number,
): Float32Array {
  const amplitudes = [0.45, 1.0, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08]
  const buffer = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const t = startPhaseSeconds + i / sampleRate
    let sample = 0
    for (let n = 1; n <= amplitudes.length; n++) {
      sample += amplitudes[n - 1] * Math.sin(2 * Math.PI * f0 * n * t)
    }
    buffer[i] = sample * 0.2
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

// ----- Gitara -----

/**
 * Kopia verbatim autoCorrelate z components/guitar-tuner.tsx sprzed wymiany
 * silnika — trzymana tu jako baseline, żeby różnica była zmierzona, a nie
 * deklarowana. Wady widoczne w samym kodzie: po pierwszym zboczu bierze
 * GLOBALNE maksimum ACF (piki w T, 2T, 3T są prawie równe — loteria
 * oktawowa) i nie ogranicza lagu (wynik może być dowolną liczbą).
 */
function legacyTunerAutoCorrelate(buffer: Float32Array, sampleRate: number): number {
  let rms = 0
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / buffer.length)
  if (rms < 0.01) return -1

  let r1 = 0
  let r2 = buffer.length - 1
  const threshold = 0.2
  for (let i = 0; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) { r1 = i; break }
  }
  for (let i = 1; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[buffer.length - i]) < threshold) { r2 = buffer.length - i; break }
  }

  const buf2 = buffer.slice(r1, r2)
  const c = new Array(buf2.length).fill(0)
  for (let i = 0; i < buf2.length; i++) {
    for (let j = 0; j < buf2.length - i; j++) c[i] += buf2[j] * buf2[j + i]
  }

  let d = 0
  while (c[d] > c[d + 1]) d++
  let maxval = -1
  let maxpos = -1
  for (let i = d; i < buf2.length; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i }
  }
  let T0 = maxpos

  const x1 = c[T0 - 1]
  const x2 = c[T0]
  const x3 = c[T0 + 1]
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  if (a) T0 = T0 - b / (2 * a)

  return sampleRate / T0
}

/** Zakres tunera: pół tonu pod najniższą struną tuningów (D2), z górką na flażolety. */
const TUNER_MIN_HZ = 60
const TUNER_MAX_HZ = 1200

interface GuitarCase {
  label: string
  truth: number
  buffer: Float32Array
  sampleRate: number
}

function buildGuitarCases(bufferSize: number): GuitarCase[] {
  const uniqueStrings = new Map<string, number>()
  for (const tuning of TUNINGS) {
    for (const s of tuning.strings) uniqueStrings.set(`${s.note}${s.octave}`, s.frequency)
  }

  const cases: GuitarCase[] = []
  for (const sampleRate of [44100, 48000]) {
    for (const [label, truth] of uniqueStrings) {
      // Trzy punkty wybrzmienia: tuż po ataku, środek, ogon.
      for (const timeSincePluck of [0.15, 0.5, 1.0]) {
        cases.push({
          label: `${label} @ ${(sampleRate / 1000).toFixed(1)}k t=${timeSincePluck}`,
          truth,
          buffer: synthesizePluckedString(truth, sampleRate, bufferSize, timeSincePluck),
          sampleRate,
        })
      }
      // Niskie struny dodatkowo z dominującą h2 (rezonans pudła).
      if (truth < 120) {
        cases.push({
          label: `${label} @ ${(sampleRate / 1000).toFixed(1)}k h2!`,
          truth,
          buffer: synthesizePluckedString(truth, sampleRate, bufferSize, 0.3, 3e-4, true),
          sampleRate,
        })
      }
      // Szum pokoju: tuner nie pracuje w komorze bezechowej.
      for (const snrDb of [20, 12]) {
        const noisy = synthesizePluckedString(truth, sampleRate, bufferSize, 0.5)
        addNoise(noisy, snrDb, 0xace + Math.round(truth))
        cases.push({
          label: `${label} @ ${(sampleRate / 1000).toFixed(1)}k SNR${snrDb}`,
          truth,
          buffer: noisy,
          sampleRate,
        })
      }
    }
  }
  return cases
}

function addNoise(buffer: Float32Array, snrDb: number, seed: number): void {
  let signalPower = 0
  for (let i = 0; i < buffer.length; i++) signalPower += buffer[i] * buffer[i]
  signalPower /= buffer.length
  const noiseAmplitude = Math.sqrt((signalPower / Math.pow(10, snrDb / 10)) * 3)
  const rng = makeRng(seed)
  for (let i = 0; i < buffer.length; i++) buffer[i] += (rng() * 2 - 1) * noiseAmplitude
}

function evaluateGuitarEngine(
  name: string,
  run: (c: GuitarCase) => number | null,
  cases: GuitarCase[],
  verbose: boolean,
): void {
  let octaveErrors = 0
  let inTolerance = 0
  let missed = 0
  const failures: string[] = []

  for (const c of cases) {
    const detected = run(c)
    if (detected === null || detected <= 0 || !Number.isFinite(detected)) {
      missed++
      failures.push(`${c.label}: brak detekcji`)
      continue
    }
    const err = centsError(detected, c.truth)
    if (Math.abs(err) <= 50) inTolerance++
    if (isOctaveError(detected, c.truth)) {
      octaveErrors++
      failures.push(`${c.label}: ${c.truth.toFixed(1)} → ${detected.toFixed(1)} Hz (×${(detected / c.truth).toFixed(2)})`)
    } else if (Math.abs(err) > 50) {
      failures.push(`${c.label}: ${c.truth.toFixed(1)} → ${detected.toFixed(1)} Hz (${err.toFixed(0)}¢)`)
    }
  }

  const rpa = ((100 * inTolerance) / cases.length).toFixed(1)
  console.log(
    `  ${name.padEnd(34)} RPA ${`${rpa}%`.padStart(7)}   oktawy ${`${octaveErrors}/${cases.length}`.padStart(8)}   brak ${String(missed).padStart(3)}`,
  )
  if (verbose) {
    for (const f of failures.slice(0, 12)) console.log(`       ✗ ${f}`)
    if (failures.length > 12) console.log(`       … i ${failures.length - 12} więcej`)
  }
}

/** Chroma (nazwa nuty) — tor gry akordowej porównuje wyłącznie to. */
function chromaOf(frequency: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440))
  return names[((midi % 12) + 12) % 12]
}

function runGuitarSection(): void {
  console.log("\n═══ GITARA ═══")

  // Tuner pracuje na buforze 4096 (fftSize analysera).
  const tunerCases = buildGuitarCases(4096)
  console.log(`  ${tunerCases.length} przypadków: struny 6 tuningów × 2 sample rate × punkty wybrzmienia\n`)

  evaluateGuitarEngine(
    "tuner PRZED (autoCorrelate)",
    (c) => legacyTunerAutoCorrelate(c.buffer, c.sampleRate),
    tunerCases,
    false,
  )
  // Próg 0,85 = tylko ścieżka progowa YIN, identycznie jak w produkcie.
  // Fallback z globalnego minimum ma pewność <0,85 i jest odrzucany.
  const TUNER_CONFIDENCE_GATE = 0.85
  const FUNDAMENTAL_FLOOR = 0.05
  const tunerEngine = (buffer: Float32Array, sampleRate: number): number | null => {
    const r = detectF0(buffer, sampleRate, { minFrequency: TUNER_MIN_HZ, maxFrequency: TUNER_MAX_HZ })
    if (!r || r.confidence < TUNER_CONFIDENCE_GATE) return null
    if (fundamentalPresence(applyHannWindow(buffer), sampleRate, r.frequency) < FUNDAMENTAL_FLOOR) return null
    return r.frequency
  }
  evaluateGuitarEngine(
    "tuner PO (YIN 0,85 + obecność f0)",
    (c) => tunerEngine(c.buffer, c.sampleRate),
    tunerCases,
    true,
  )

  // Dwie struny naraz (sympatyczne wybrzmienie, niedotłumiona struna).
  // Poprawne zachowanie tunera: MILCZEĆ albo podać jedną z brzmiących strun.
  // Zmyślona trzecia częstotliwość = strojenie do dźwięku, którego nikt nie gra.
  const dyads: [number, number][] = [
    [82.41, 110.0],   // E2+A2
    [110.0, 146.83],  // A2+D3
    [146.83, 196.0],  // D3+G3
    [196.0, 246.94],  // G3+B3
    [246.94, 329.63], // B3+E4
  ]
  let dyadAbstain = 0
  let dyadOneString = 0
  let dyadGarbage = 0
  const garbageExamples: string[] = []
  for (const sampleRate of [44100, 48000]) {
    for (const [f1, f2] of dyads) {
      for (const t of [0.15, 0.5]) {
        const a = synthesizePluckedString(f1, sampleRate, 4096, t)
        const b = synthesizePluckedString(f2, sampleRate, 4096, t)
        const mix = new Float32Array(4096)
        for (let i = 0; i < 4096; i++) mix[i] = 0.6 * a[i] + 0.5 * b[i]

        const detected = tunerEngine(mix, sampleRate)
        if (detected === null) { dyadAbstain++; continue }
        const near = (target: number) => Math.abs(centsError(detected, target)) <= 50
        if (near(f1) || near(f2)) dyadOneString++
        else {
          dyadGarbage++
          garbageExamples.push(`${f1}+${f2} @ ${sampleRate}: → ${detected.toFixed(1)} Hz`)
        }
      }
    }
  }
  const dyadTotal = dyadAbstain + dyadOneString + dyadGarbage
  console.log(
    `  ${"dwie struny naraz (dyady)".padEnd(34)} milczy ${String(dyadAbstain).padStart(3)}/${dyadTotal}   jedna ze strun ${String(dyadOneString).padStart(3)}   ZMYŚLONE ${String(dyadGarbage).padStart(3)}`,
  )
  for (const g of garbageExamples.slice(0, 6)) console.log(`       ✗ ${g}`)

  // Koszt ramki obu silników na buforze tunera (4096) — tuner też chodzi z rAF.
  const costCase = tunerCases[0]
  for (const [name, run] of [
    ["autoCorrelate", () => legacyTunerAutoCorrelate(costCase.buffer, costCase.sampleRate)],
    ["rdzeń YIN", () => detectF0(costCase.buffer, costCase.sampleRate, { minFrequency: TUNER_MIN_HZ, maxFrequency: TUNER_MAX_HZ })],
  ] as [string, () => unknown][]) {
    for (let i = 0; i < 10; i++) run()
    const start = process.hrtime.bigint()
    const iterations = 50
    for (let i = 0; i < iterations; i++) run()
    const ms = Number(process.hrtime.bigint() - start) / iterations / 1e6
    console.log(`  koszt ramki 4096: ${name.padEnd(16)} ${ms.toFixed(2).padStart(7)} ms`)
  }

  // Gra akordowa: bufor 2048, tor detektora Pro (domyślny), zaliczana CHROMA.
  const chordCases = buildGuitarCases(2048)
  let chromaCorrect = 0
  let chromaWrong = 0
  let chordMissed = 0
  const wrongExamples: string[] = []
  for (const c of chordCases) {
    resetProPitchTracking()
    const r = detectPitchPro(c.buffer, c.sampleRate, { rmsThreshold: 0.001 })
    if (!r) { chordMissed++; continue }
    if (chromaOf(r.frequency) === chromaOf(c.truth)) chromaCorrect++
    else {
      chromaWrong++
      wrongExamples.push(`${c.label}: chroma ${chromaOf(c.truth)} → ${chromaOf(r.frequency)} (${r.frequency.toFixed(1)} Hz)`)
    }
  }
  console.log(
    `  ${"gra akordowa (Pro, chroma)".padEnd(34)} OK ${`${chromaCorrect}/${chordCases.length}`.padStart(9)}   złe ${String(chromaWrong).padStart(4)}   brak ${String(chordMissed).padStart(3)}`,
  )
  for (const w of wrongExamples.slice(0, 8)) console.log(`       ✗ ${w}`)
}

function runStrongH2Section(): void {
  console.log("\n═══ GŁOS: dominująca h2 (pułapka oktawy w górę) ═══")
  for (const detector of ["basic", "pro"] as Detector[]) {
    const outcomes: FrameOutcome[] = []
    for (const { note, octave } of CHROMATIC_RANGE) {
      const truth = noteToFrequency(note, octave)
      resetDetector(detector)
      for (let frame = 0; frame < FRAMES_PER_NOTE; frame++) {
        const startSeconds = (frame * BUFFER_SIZE) / 48000
        const buffer = synthesizeStrongH2Voice(truth, 48000, BUFFER_SIZE, startSeconds)
        const detected = runDetector(detector, buffer, 48000)
        if (frame >= WARMUP_FRAMES) outcomes.push({ truth, detected })
      }
    }
    printStats(`${detector} — h2 głośniejsza od h1`, summarize(outcomes))
  }
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

  runStrongH2Section()
  runGuitarSection()
  console.log()
}

main()
