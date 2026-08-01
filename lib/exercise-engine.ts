/**
 * Silnik ćwiczeń sterowany zakresem głosu.
 *
 * Trzy zasady, wyprowadzone wprost z recenzji benchmarku (Vocalista):
 *
 *  1. ZAKRES JEST CIĄGŁY. Żadnych wiaderek tenor/baryton — najwyżej oceniana
 *     skarga u konkurencji brzmi „should just let you set the range". Ćwiczenie
 *     transponuje się półton po półtonie w TWOIM zmierzonym zakresie.
 *  2. WZORZEC TO DANE. Interwały względem toniki + sylaba + czasy. Nowe
 *     ćwiczenie = nowy wpis w tablicy, zero nowego kodu.
 *  3. OCENA NA OKNACH CZASOWYCH, NIE NA PROPORCJACH. Aplikacja dyktuje tempo
 *     (odliczanie → nuty w znanych momentach), więc okno każdej nuty jest znane
 *     z góry. Poprzednia wersja rozciągała nagranie proporcjonalnie do liczby
 *     nut — pauza na oddech przesuwała wszystkie okna i psuła wynik.
 */

import type { PitchData } from "./pitch-detector"

// ----- Wzorce -----

export type ExerciseCategory = "rozgrzewka" | "skale" | "interwaly" | "zwinnosc"

export interface PatternStep {
  /** Półtony względem toniki. */
  semitones: number
  durationMs: number
}

export interface ExercisePattern {
  id: string
  name: string
  /** Jedno zdanie: co to ćwiczy i jak śpiewać. */
  description: string
  /** Sylaba śpiewana na każdej nucie. */
  syllable: string
  category: ExerciseCategory
  steps: PatternStep[]
}

const N = (semitones: number, durationMs = 600): PatternStep => ({ semitones, durationMs })

export const EXERCISE_PATTERNS: ExercisePattern[] = [
  // ── Rozgrzewka ──
  {
    id: "long-tone",
    name: "Długi ton",
    description: "Jedna nuta trzymana równo. Fundament wszystkiego: oddech i stabilność.",
    syllable: "Mum",
    category: "rozgrzewka",
    steps: [N(0, 2400)],
  },
  {
    id: "five-down",
    name: "Piątka w dół",
    description: "Pięć stopni gamy z góry na dół. Klasyczna rozgrzewka — swobodne opadanie.",
    syllable: "Nya",
    category: "rozgrzewka",
    steps: [N(7), N(5), N(4), N(2), N(0, 900)],
  },
  {
    id: "five-up-down",
    name: "Piątka w górę i w dół",
    description: "Do kwinty i z powrotem. Równe przejścia między stopniami.",
    syllable: "Mum",
    category: "rozgrzewka",
    steps: [N(0), N(2), N(4), N(5), N(7, 800), N(5), N(4), N(2), N(0, 900)],
  },

  // ── Skale ──
  {
    id: "major-scale-up",
    name: "Gama durowa w górę",
    description: "Pełna oktawa stopień po stopniu. Każda nuta osobno, bez ślizgania.",
    syllable: "La",
    category: "skale",
    steps: [N(0), N(2), N(4), N(5), N(7), N(9), N(11), N(12, 900)],
  },
  {
    id: "major-scale-down",
    name: "Gama durowa w dół",
    description: "Oktawa z góry na dół — trudniejsza, bo intonacja w dół lubi opadać za nisko.",
    syllable: "La",
    category: "skale",
    steps: [N(12), N(11), N(9), N(7), N(5), N(4), N(2), N(0, 900)],
  },

  // ── Interwały ──
  {
    id: "major-third",
    name: "Tercja wielka",
    description: "Tonika → tercja → tonika. Usłysz odległość, zanim ją zaśpiewasz.",
    syllable: "Nie",
    category: "interwaly",
    steps: [N(0, 800), N(4, 800), N(0, 900)],
  },
  {
    id: "perfect-fifth",
    name: "Kwinta czysta",
    description: "Najstabilniejszy interwał po oktawie. Tonika → kwinta → tonika.",
    syllable: "Noo",
    category: "interwaly",
    steps: [N(0, 800), N(7, 800), N(0, 900)],
  },
  {
    id: "octave-leap",
    name: "Skok oktawowy",
    description: "Ta sama nuta, oktawę wyżej. Rejestr się zmienia — wysokość ma nie uciec.",
    syllable: "Ha",
    category: "interwaly",
    steps: [N(0, 800), N(12, 900), N(0, 900)],
  },
  {
    id: "major-arpeggio",
    name: "Arpeggio durowe",
    description: "Tonika–tercja–kwinta–oktawa i z powrotem. Skoki zamiast stopni.",
    syllable: "Ja",
    category: "interwaly",
    steps: [N(0), N(4), N(7), N(12, 800), N(7), N(4), N(0, 900)],
  },

  // ── Zwinność ──
  {
    id: "thirds-run",
    name: "Tercje po stopniach",
    description: "Do–mi, re–fa, mi–so. Skacz czysto, wracaj dokładnie.",
    syllable: "Di",
    category: "zwinnosc",
    steps: [N(0, 450), N(4, 450), N(2, 450), N(5, 450), N(4, 450), N(7, 450), N(0, 900)],
  },
  {
    id: "quick-five",
    name: "Szybka piątka",
    description: "Piątka w górę i w dół w szybkim tempie. Precyzja przy prędkości.",
    syllable: "Pa",
    category: "zwinnosc",
    steps: [N(0, 300), N(2, 300), N(4, 300), N(5, 300), N(7, 450), N(5, 300), N(4, 300), N(2, 300), N(0, 700)],
  },
]

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  rozgrzewka: "Rozgrzewka",
  skale: "Skale",
  interwaly: "Interwały",
  zwinnosc: "Zwinność",
}

// ----- Zakres głosu -----

export interface MeasuredRange {
  /** Najniższa wygodna nuta, MIDI (ciągłe, bez zaokrąglenia do typu głosu). */
  lowMidi: number
  highMidi: number
  measuredAt: number
}

const RANGE_STORAGE_KEY = "measured-vocal-range-v1"

export function loadMeasuredRange(): MeasuredRange | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MeasuredRange
    if (!Number.isFinite(parsed.lowMidi) || !Number.isFinite(parsed.highMidi)) return null
    if (parsed.highMidi - parsed.lowMidi < 5) return null // pomiar bez sensu
    return parsed
  } catch {
    return null
  }
}

export function saveMeasuredRange(range: MeasuredRange): void {
  if (typeof window === "undefined") return
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(range))
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function frequencyToMidiFloat(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440)
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export function midiToLabel(midi: number): string {
  const rounded = Math.round(midi)
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`
}

/**
 * Robustny odczyt skrajnej nuty z serii ramek pomiaru.
 *
 * Percentyl zamiast minimum/maksimum: pojedyncza ramka błędu (skrzypnięcie
 * krzesła, przydech) nie może definiować zakresu. 10. percentyl dla dołu
 * i 90. dla góry — użytkownik ma trzymać nutę, więc masa rozkładu leży na niej.
 */
export function robustExtremeMidi(frequencies: number[], side: "low" | "high"): number | null {
  const midis = frequencies
    .filter((f) => f >= 50 && f <= 2100)
    .map(frequencyToMidiFloat)
    .sort((a, b) => a - b)
  if (midis.length < 10) return null
  const index = side === "low" ? Math.floor(midis.length * 0.1) : Math.floor(midis.length * 0.9)
  return midis[index]
}

// ----- Generator sesji -----

export interface GeneratedNote {
  midi: number
  /** Względem startu ćwiczenia. */
  startMs: number
  durationMs: number
  syllable: string
}

export interface GeneratedExercise {
  pattern: ExercisePattern
  rootMidi: number
  notes: GeneratedNote[]
  totalMs: number
}

/** Przerwa między nutami wzorca — oddech artykulacji, nie pauza. */
const INTER_NOTE_GAP_MS = 80

export function generateExercise(pattern: ExercisePattern, rootMidi: number): GeneratedExercise {
  const notes: GeneratedNote[] = []
  let cursor = 0
  for (const step of pattern.steps) {
    notes.push({
      midi: rootMidi + step.semitones,
      startMs: cursor,
      durationMs: step.durationMs,
      syllable: pattern.syllable,
    })
    cursor += step.durationMs + INTER_NOTE_GAP_MS
  }
  return { pattern, rootMidi, notes, totalMs: cursor - INTER_NOTE_GAP_MS }
}

export interface SessionPlan {
  pattern: ExercisePattern
  /** Kolejne toniki, półton po półtonie: start w dolnej ćwiartce, szczyt, powrót. */
  roots: number[]
}

/**
 * Plan sesji w tessiturze.
 *
 * Margines po półtonie z każdej strony: skrajne nuty zakresu są mierzalne,
 * ale ćwiczyć na nich nie ma sensu — tam głos ledwo dochodzi. Start w dolnej
 * ćwiartce użytecznego pasma (rozgrzewka od wygodnego), krokami +1 półton aż
 * szczyt wzorca dotknie góry, potem z powrotem do punktu startu.
 */
export function planSession(pattern: ExercisePattern, range: MeasuredRange): SessionPlan {
  const patternMax = Math.max(...pattern.steps.map((s) => s.semitones))
  const patternMin = Math.min(...pattern.steps.map((s) => s.semitones))

  const lowestRoot = Math.ceil(range.lowMidi + 1 - patternMin)
  const highestRoot = Math.floor(range.highMidi - 1 - patternMax)

  if (highestRoot < lowestRoot) {
    // Zakres za wąski na ten wzorzec — jedna tonika na środku, niech
    // użytkownik w ogóle może zacząć.
    const middle = Math.round((range.lowMidi + range.highMidi) / 2 - (patternMax + patternMin) / 2)
    return { pattern, roots: [middle] }
  }

  const span = highestRoot - lowestRoot
  const startRoot = lowestRoot + Math.round(span * 0.25)

  const roots: number[] = []
  for (let root = startRoot; root <= highestRoot; root++) roots.push(root)
  for (let root = highestRoot - 1; root >= startRoot; root--) roots.push(root)

  return { pattern, roots }
}

// ----- Ocena względem celu -----

export interface NoteResult {
  target: GeneratedNote
  /** Mediana zaśpiewanej wysokości w oknie nuty; null = nic nie zaśpiewano. */
  sungMidi: number | null
  /** Błąd w centach względem celu; null gdy brak śpiewu. */
  centsError: number | null
  hit: boolean
}

export interface ExerciseResult {
  notes: NoteResult[]
  hitCount: number
  /** Mediana |błędu| po nutach, które zostały zaśpiewane. */
  medianAbsCents: number | null
  /** 0–100: udział trafionych nut. */
  score: number
}

/** Tolerancja trafienia. Eksperci uznają ±20–25¢ za „w stroju"; 50¢ to pół półtonu. */
const HIT_TOLERANCE_CENTS = 50
/**
 * Początek okna nuty pomijany w ocenie: przejście z poprzedniej nuty i atak
 * nie są intonacją, którą ćwiczymy.
 */
const NOTE_HEAD_SKIP_RATIO = 0.25

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Okna czasowe zakotwiczone w `recordingStartMs` (moment końca odliczania,
 * timestamp z tej samej domeny co PitchData.timestamp — Date.now()).
 */
export function scoreExercise(
  pitchHistory: PitchData[],
  exercise: GeneratedExercise,
  recordingStartMs: number,
): ExerciseResult {
  const notes: NoteResult[] = exercise.notes.map((target) => {
    const headSkip = target.durationMs * NOTE_HEAD_SKIP_RATIO
    const windowStart = recordingStartMs + target.startMs + headSkip
    const windowEnd = recordingStartMs + target.startMs + target.durationMs

    const frames = pitchHistory.filter(
      (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd && p.frequency > 0,
    )

    if (frames.length < 3) {
      return { target, sungMidi: null, centsError: null, hit: false }
    }

    const sungMidi = median(frames.map((p) => frequencyToMidiFloat(p.frequency)))
    const centsError = (sungMidi - target.midi) * 100

    return {
      target,
      sungMidi,
      centsError,
      hit: Math.abs(centsError) <= HIT_TOLERANCE_CENTS,
    }
  })

  const sung = notes.filter((n) => n.centsError !== null)
  const hitCount = notes.filter((n) => n.hit).length

  return {
    notes,
    hitCount,
    medianAbsCents: sung.length > 0 ? median(sung.map((n) => Math.abs(n.centsError!))) : null,
    score: Math.round((100 * hitCount) / notes.length),
  }
}
