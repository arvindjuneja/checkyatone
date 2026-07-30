/**
 * Bateria weryfikująca scoring intonacji.
 *
 * Uruchomienie: npm run eval:scoring
 *
 * Nie ma tu żadnego panelu ekspertów ani nagrań — każdy przypadek to wykonanie
 * o ZNANEJ, wstrzykniętej wadzie, a test sprawdza, czy miara rusza się w tym
 * wymiarze, w którym powinna, i w tę stronę, w którą powinna. To jest
 * walidacja konstruktowa: nie odpowiada na pytanie „czy nauczyciel by się
 * zgodził", tylko na pytanie „czy ta liczba w ogóle mierzy to, co deklaruje".
 *
 * Obok liczona jest stara miara („średnia dokładność" = odległość do
 * najbliższego półtonu), żeby różnica była widoczna, a nie deklarowana.
 */

import { frequencyToNote, type PitchData } from "../lib/pitch-detector"
import { analyzeIntonation, scoreIntonation } from "../lib/scoring"

// ----- Generator wykonania -----

const FRAME_INTERVAL_MS = 16 // ~60 fps, tak jak pętla rAF w aplikacji
const NOTE_DURATION_MS = 700
const GAP_MS = 120

interface PerformanceOptions {
  /** Stałe przesunięcie całego wykonania, w centach. */
  offsetCents?: number
  /** Losowy rozrzut per nuta, w centach (rozkład jednostajny ±jitter). */
  noteJitterCents?: number
  /** Całkowity dryf od początku do końca wykonania, w centach. */
  driftCents?: number
  /** Rozpiętość vibrata w centach (0 = brak). */
  vibratoCents?: number
  vibratoHz?: number
  /** Losowe zaburzenie SAMYCH interwałów, w centach — psuje słuch relatywny. */
  intervalJitterCents?: number
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Prosta melodia w tessiturze mezzo: stopnie gamy C-dur wokół C4. */
const MELODY_MIDI = [60, 62, 64, 65, 67, 65, 64, 62, 60, 64, 67, 72, 67, 64, 60, 62]

function synthesizePerformance(options: PerformanceOptions = {}, seed = 1): PitchData[] {
  const {
    offsetCents = 0,
    noteJitterCents = 0,
    driftCents = 0,
    vibratoCents = 0,
    vibratoHz = 6,
    intervalJitterCents = 0,
  } = options

  const rng = makeRng(seed)
  const frames: PitchData[] = []
  const totalMs = MELODY_MIDI.length * (NOTE_DURATION_MS + GAP_MS)

  // Zaburzenie interwałów kumuluje się, bo psujemy ODLEGŁOŚCI, nie pozycje.
  let intervalDrift = 0

  let timestamp = 0
  for (let index = 0; index < MELODY_MIDI.length; index++) {
    if (index > 0 && intervalJitterCents > 0) {
      intervalDrift += (rng() * 2 - 1) * intervalJitterCents
    }
    const noteJitter = noteJitterCents > 0 ? (rng() * 2 - 1) * noteJitterCents : 0

    for (let elapsed = 0; elapsed < NOTE_DURATION_MS; elapsed += FRAME_INTERVAL_MS) {
      const progress = timestamp / totalMs
      const vibrato =
        vibratoCents > 0
          ? (vibratoCents / 2) * Math.sin((2 * Math.PI * vibratoHz * timestamp) / 1000)
          : 0

      const cents = offsetCents + noteJitter + intervalDrift + driftCents * progress + vibrato
      const midi = MELODY_MIDI[index] + cents / 100
      const frequency = 440 * Math.pow(2, (midi - 69) / 12)
      const noteInfo = frequencyToNote(frequency)

      frames.push({
        frequency,
        note: noteInfo.note,
        octave: noteInfo.octave,
        cents: noteInfo.cents,
        confidence: 0.95,
        timestamp,
      })
      timestamp += FRAME_INTERVAL_MS
    }
    timestamp += GAP_MS
  }

  return frames
}

// ----- Stara miara, dokładnie jak w hooks/use-session-library.ts -----

function legacyAccuracy(pitchHistory: PitchData[]): number {
  const perfect = pitchHistory.filter((p) => Math.abs(p.cents) <= 10).length
  const good = pitchHistory.filter((p) => Math.abs(p.cents) > 10 && Math.abs(p.cents) <= 25).length
  return Math.round(((perfect + good * 0.7) / pitchHistory.length) * 100)
}

// ----- Pomocnicze -----

function scoreOf(options: PerformanceOptions, seed = 1, referenceLocked = false): number {
  const report = analyzeIntonation(synthesizePerformance(options, seed))
  return scoreIntonation(report, { referenceLocked }) ?? -1
}

let failures = 0

function check(label: string, passed: boolean, detail: string): void {
  if (!passed) failures++
  console.log(`  ${passed ? "OK  " : "BŁĄD"}  ${label.padEnd(46)} ${detail}`)
}

function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—"
}

// ----- Przypadki -----

function testSystematicFlatness(): void {
  console.log("\n── Stabilne fałszowanie: stała odchyłka, znikomy rozrzut ──")
  console.log("   Tu stara miara łamie się jawnie: powyżej 50 centów odchyłka")
  console.log("   przeskakuje do sąsiedniego półtonu i 'dokładność' zaczyna ROSNĄĆ.\n")
  console.log("     offset    stara miara    nowy wynik    rozrzut   wykryty offset")

  const legacyValues: number[] = []
  for (const offset of [0, 20, 40, 50, 60, 80, 90]) {
    const frames = synthesizePerformance({ offsetCents: offset, noteJitterCents: 3 })
    const report = analyzeIntonation(frames)
    const legacy = legacyAccuracy(frames)
    legacyValues.push(legacy)
    const score = scoreIntonation(report) ?? -1
    console.log(
      `     ${String(offset).padStart(4)}¢   ${String(legacy).padStart(9)}%   ${String(score).padStart(9)}    ${fmt(report.spreadCents).padStart(6)}¢   ${String(Math.round(report.offsetCents)).padStart(9)}¢`,
    )
  }

  const legacyRebounds = legacyValues.some((v, i) => i > 0 && v > legacyValues[i - 1] + 5)
  check(
    "stara miara rośnie mimo gorszej intonacji",
    legacyRebounds,
    legacyRebounds ? "potwierdzone — miara jest niemonotoniczna" : "nie odtworzono",
  )
}

const SEEDS = 25

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/**
 * Pojedyncze losowanie na 16 nutach ma spory rozrzut własny, więc test na
 * jednym ziarnie mierzy los, nie estymator. Mediana z SEEDS przebiegów.
 */
function medianScore(options: PerformanceOptions): { score: number; spread: number; center: number } {
  const scores: number[] = []
  const spreads: number[] = []
  let centersFound = 0

  for (let seed = 1; seed <= SEEDS; seed++) {
    const report = analyzeIntonation(synthesizePerformance(options, seed))
    scores.push(scoreIntonation(report) ?? -1)
    spreads.push(report.spreadCents)
    if (report.tonalCenterFound) centersFound++
  }

  return {
    score: medianOf(scores),
    spread: medianOf(spreads),
    center: centersFound / SEEDS,
  }
}

/**
 * Powyżej ±50 centów odchyłki na nutę nie da się orzec, w który półton celował
 * śpiewający — miara nasyca się i musi nasycić. Monotoniczności wymagamy w
 * regionie mierzalnym, a poza nim wymagamy, żeby wynik nie ODBIŁ w górę i żeby
 * raport przyznał się do braku centrum tonalnego.
 */
const MEASURABLE_JITTER_LIMIT = 50

function testSpreadMonotonicity(): void {
  console.log("\n── Monotoniczność: rosnący rozrzut musi obniżać wynik ──")
  console.log(`   Mediana z ${SEEDS} losowań. Granica mierzalności: ±${MEASURABLE_JITTER_LIMIT}¢ na nutę.\n`)
  console.log("     jitter    wynik    rozrzut   centrum tonalne")

  const measured: { jitter: number; score: number }[] = []
  for (const jitter of [0, 10, 20, 30, 40, 50, 65, 80]) {
    const { score, spread, center } = medianScore({ noteJitterCents: jitter })
    measured.push({ jitter, score })
    console.log(
      `     ${String(jitter).padStart(4)}¢   ${String(score).padStart(6)}   ${fmt(spread).padStart(6)}¢   ${String(Math.round(center * 100)).padStart(11)}%`,
    )
  }

  const inRange = measured.filter((m) => m.jitter <= MEASURABLE_JITTER_LIMIT)
  const monotone = inRange.every((m, i) => i === 0 || m.score <= inRange[i - 1].score)
  check(
    `wynik nie rośnie do granicy ±${MEASURABLE_JITTER_LIMIT}¢`,
    monotone,
    inRange.map((m) => m.score).join(" → "),
  )

  const beyond = measured.filter((m) => m.jitter > MEASURABLE_JITTER_LIMIT)
  check(
    "poza granicą wynik nie odbija w górę",
    beyond.every((m) => m.score === -1),
    beyond.every((m) => m.score === -1) ? "brak wyniku zamiast zmyślonej liczby" : beyond.map((m) => m.score).join(" → "),
  )

  const degenerate = medianScore({ noteJitterCents: 80 })
  check(
    "brak centrum tonalnego jest zaraportowany, nie zamaskowany",
    degenerate.center < 0.2,
    `centrum znalezione w ${Math.round(degenerate.center * 100)}% losowań`,
  )
}

function testTransposition(): void {
  console.log("\n── Transpozycja: czyste wykonanie w innej tonacji ──")

  const base = scoreOf({ noteJitterCents: 5 }, 3)
  const shifted = scoreOf({ noteJitterCents: 5, offsetCents: 250 }, 3)
  const delta = Math.abs(base - shifted)

  check(
    "transpozycja +250¢ zmienia wynik o ≤3 pkt",
    delta <= 3,
    `${base} → ${shifted} (Δ ${delta})`,
  )

  const locked = scoreOf({ noteJitterCents: 5, offsetCents: 45 }, 3, true)
  const free = scoreOf({ noteJitterCents: 5, offsetCents: 45 }, 3, false)
  check(
    "przy podkładzie offset 45¢ obniża wynik",
    locked < free,
    `a cappella ${free}, z podkładem ${locked}`,
  )
}

function testVibrato(): void {
  console.log("\n── Vibrato: technika, nie niestabilność ──")

  const plain = scoreOf({ noteJitterCents: 5 }, 11)
  const withVibrato = scoreOf({ noteJitterCents: 5, vibratoCents: 70, vibratoHz: 6 }, 11)

  check(
    "vibrato 6 Hz ±70¢ nie obniża wyniku",
    withVibrato >= plain,
    `bez ${plain}, z vibratem ${withVibrato}`,
  )

  const report = analyzeIntonation(
    synthesizePerformance({ noteJitterCents: 5, vibratoCents: 70, vibratoHz: 6 }, 11),
  )
  check(
    "vibrato zostaje rozpoznane i zaraportowane",
    report.vibratoShare >= 0.5,
    `${Math.round(report.vibratoShare * 100)}% nut`,
  )
}

function testDrift(): void {
  console.log("\n── Dryf: strój równy, ale całość się osuwa ──")

  const frames = synthesizePerformance({ noteJitterCents: 4, driftCents: -60 }, 5)
  const report = analyzeIntonation(frames)
  const durationMinutes = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 60000
  const expected = -60 / durationMinutes

  check(
    "dryf wykryty co do znaku i rzędu wielkości",
    report.driftCentsPerMinute < 0 && Math.abs(report.driftCentsPerMinute - expected) < Math.abs(expected) * 0.5,
    `${fmt(report.driftCentsPerMinute)} ¢/min (oczekiwane ${fmt(expected)})`,
  )

  const stable = analyzeIntonation(synthesizePerformance({ noteJitterCents: 4 }, 5))
  check(
    "brak dryfu nie produkuje fałszywego alarmu",
    Math.abs(stable.driftCentsPerMinute) < 15,
    `${fmt(stable.driftCentsPerMinute)} ¢/min`,
  )
}

function testIntervals(): void {
  console.log("\n── Błąd interwałowy: niezależny od offsetu z definicji ──")

  const clean = analyzeIntonation(synthesizePerformance({ noteJitterCents: 3 }, 13))
  const broken = analyzeIntonation(synthesizePerformance({ intervalJitterCents: 35 }, 13))

  check(
    "zaburzenie interwałów podnosi błąd interwałowy",
    broken.intervalErrorCents > clean.intervalErrorCents + 10,
    `${fmt(clean.intervalErrorCents)}¢ → ${fmt(broken.intervalErrorCents)}¢`,
  )

  const shifted = analyzeIntonation(
    synthesizePerformance({ noteJitterCents: 3, offsetCents: 250 }, 13),
  )
  check(
    "transpozycja nie rusza błędu interwałowego",
    Math.abs(shifted.intervalErrorCents - clean.intervalErrorCents) < 5,
    `${fmt(clean.intervalErrorCents)}¢ vs ${fmt(shifted.intervalErrorCents)}¢`,
  )
}

function testSegmentation(): void {
  console.log("\n── Segmentacja ──")

  const report = analyzeIntonation(synthesizePerformance({ noteJitterCents: 5 }, 17))
  check(
    "liczba nut zgadza się z melodią",
    Math.abs(report.noteCount - MELODY_MIDI.length) <= 1,
    `${report.noteCount} z ${MELODY_MIDI.length}`,
  )

  const short = analyzeIntonation(synthesizePerformance().slice(0, 30))
  check("zbyt krótkie nagranie raportuje brak danych", short.insufficientData, `${short.noteCount} nut`)
  check("i nie produkuje wyniku", scoreIntonation(short) === null, "null")
}

function main(): void {
  testSystematicFlatness()
  testSpreadMonotonicity()
  testTransposition()
  testVibrato()
  testDrift()
  testIntervals()
  testSegmentation()

  console.log(`\n${failures === 0 ? "Wszystkie kryteria spełnione." : `NIESPEŁNIONE KRYTERIA: ${failures}`}\n`)
  if (failures > 0) process.exitCode = 1
}

main()
