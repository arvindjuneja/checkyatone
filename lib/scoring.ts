/**
 * Scoring intonacji.
 *
 * Poprzednia miara („średnia dokładność") liczyła odległość każdej ramki do
 * NAJBLIŻSZEGO dowolnego półtonu siatki temperacji równej. Ma trzy wady, z
 * których każda osobno ją unieważnia:
 *
 *   1. Nie jest monotoniczna. Śpiewając stabilnie 40 centów nisko dostajesz karę
 *      40. Zejdź do 60 nisko — przeskakujesz do sąsiedniego półtonu i kara
 *      spada do 40. Miara ROŚNIE, gdy fałszujesz mocniej.
 *   2. Nie odróżnia „czysto, ale w innej tonacji" od „chaotycznie". Pierwsze to
 *      norma przy śpiewie a cappella, drugie to jedyna rzecz warta poprawiania.
 *   3. Karze vibrato jako niestabilność.
 *
 * Zamiast tego cztery liczby, zawsze razem:
 *
 *   OFFSET      — systematyczne przesunięcie całego wykonania, w centach.
 *                 Kąt wektora średniego na okręgu odchyłek.
 *   ROZRZUT     — rozrzut kołowy reszt wokół tego offsetu. To jest ta liczba,
 *                 która mówi „śpiewasz chaotycznie".
 *   DRYF        — nachylenie rozwiniętych reszt w czasie, w centach na minutę.
 *                 Osobno, bo „opadasz w trakcie frazy" to inna recepta niż
 *                 „trafiasz źle".
 *   BŁĄD INTERWAŁOWY — mediana odchyłki odległości między kolejnymi nutami od
 *                 najbliższego półtonu. Z definicji niezależny od offsetu.
 *
 * Wszystkie liczone na MEDIANACH NUT, nie na ramkach. To jedno rozstrzyga
 * problem vibrata: mediana nuty z vibratem ±70 centów jest taka sama jak bez
 * niego, więc technika nie wchodzi do rozrzutu. Scoring ramkowy nie ma jak
 * tego rozdzielić.
 */

import type { PitchData } from "./pitch-detector"

// ----- Segmentacja na nuty -----

/** Odchyłka od mediany segmentu, powyżej której ramka nie należy już do tej nuty. */
const NOTE_BREAK_SEMITONES = 0.75
/** Ile ramek z rzędu poza pasmem zamyka nutę. Chroni przed rozbiciem na vibrato. */
const NOTE_BREAK_FRAMES = 3
/** Przerwa w konturze dłuższa niż to traktowana jest jako cisza. */
const SILENCE_GAP_MS = 150
/** Krótsze zdarzenia to atak, portamento albo artefakt, nie nuta. */
const MIN_NOTE_MS = 120
const MIN_NOTE_FRAMES = 5
/** Początek nuty pomijany przy liczeniu mediany — tam siedzi atak i dojście. */
const ATTACK_SKIP_MS = 40

export interface DetectedNote {
  startMs: number
  endMs: number
  durationMs: number
  /** Mediana wysokości w ciągłej skali MIDI (69 = A4), bez zaokrąglania. */
  medianMidi: number
  frameCount: number
  vibratoRateHz: number
  vibratoExtentCents: number
}

function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440)
}

function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Mediana odchyleń bezwzględnych od mediany. Odporna na pojedyncze wystrzały. */
function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return NaN
  const center = median(values)
  return median(values.map((v) => Math.abs(v - center)))
}

interface Frame {
  midi: number
  timestamp: number
}

function describeVibrato(frames: Frame[]): { rateHz: number; extentCents: number } {
  if (frames.length < 6) return { rateHz: 0, extentCents: 0 }

  const center = median(frames.map((f) => f.midi))
  const deviations = frames.map((f) => f.midi - center)

  let crossings = 0
  for (let i = 1; i < deviations.length; i++) {
    if (deviations[i] >= 0 !== deviations[i - 1] >= 0) crossings++
  }

  const durationSeconds = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000
  const rateHz = durationSeconds > 0 ? crossings / 2 / durationSeconds : 0

  const sorted = [...deviations].sort((a, b) => a - b)
  // Rozstęp 10–90 percentyla zamiast min–max: pojedyncza ramka nie robi vibrata.
  const low = sorted[Math.floor(sorted.length * 0.1)]
  const high = sorted[Math.floor(sorted.length * 0.9)]

  return { rateHz, extentCents: (high - low) * 100 }
}

export function segmentIntoNotes(pitchHistory: PitchData[]): DetectedNote[] {
  const usable = pitchHistory
    .filter((p) => p.frequency > 0 && Number.isFinite(p.frequency))
    .map<Frame>((p) => ({ midi: frequencyToMidi(p.frequency), timestamp: p.timestamp }))
    .sort((a, b) => a.timestamp - b.timestamp)

  if (usable.length === 0) return []

  const notes: DetectedNote[] = []
  let current: Frame[] = []
  let outOfBand = 0

  const closeCurrent = () => {
    if (current.length < MIN_NOTE_FRAMES) {
      current = []
      return
    }
    const startMs = current[0].timestamp
    const endMs = current[current.length - 1].timestamp
    if (endMs - startMs < MIN_NOTE_MS) {
      current = []
      return
    }

    const sustained = current.filter((f) => f.timestamp - startMs >= ATTACK_SKIP_MS)
    const body = sustained.length >= MIN_NOTE_FRAMES ? sustained : current
    const vibrato = describeVibrato(body)

    notes.push({
      startMs,
      endMs,
      durationMs: endMs - startMs,
      medianMidi: median(body.map((f) => f.midi)),
      frameCount: body.length,
      vibratoRateHz: vibrato.rateHz,
      vibratoExtentCents: vibrato.extentCents,
    })
    current = []
  }

  for (const frame of usable) {
    if (current.length === 0) {
      current = [frame]
      outOfBand = 0
      continue
    }

    const previous = current[current.length - 1]
    if (frame.timestamp - previous.timestamp > SILENCE_GAP_MS) {
      closeCurrent()
      current = [frame]
      outOfBand = 0
      continue
    }

    const center = median(current.map((f) => f.midi))
    if (Math.abs(frame.midi - center) > NOTE_BREAK_SEMITONES) {
      outOfBand++
      if (outOfBand >= NOTE_BREAK_FRAMES) {
        // Ramki, które wypchnęły nas z pasma, należą już do następnej nuty.
        const carried = current.splice(current.length - (NOTE_BREAK_FRAMES - 1))
        closeCurrent()
        current = [...carried, frame]
        outOfBand = 0
        continue
      }
    } else {
      outOfBand = 0
    }

    current.push(frame)
  }
  closeCurrent()

  return notes
}

// ----- Cztery liczby -----

export interface IntonationReport {
  /** Systematyczne przesunięcie w centach, w przedziale (−50, +50]. */
  offsetCents: number
  /** 1,4826 · MAD reszt. Skala porównywalna z odchyleniem standardowym. */
  spreadCents: number
  /** Nachylenie reszt w czasie, w centach na minutę. */
  driftCentsPerMinute: number
  /** Mediana odchyłki interwałów między kolejnymi nutami, w centach. */
  intervalErrorCents: number
  noteCount: number
  /** Udział nut z vibratem w paśmie 4–8 Hz i rozpiętości ≥20 centów. */
  vibratoShare: number
  /** Za mało nut, żeby którakolwiek z liczb coś znaczyła. */
  insufficientData: boolean
  /**
   * Czy wykonanie w ogóle daje się przypisać do jakiegokolwiek stroju.
   *
   * Powyżej mniej więcej ±50 centów odchyłki na nutę informacja się kończy:
   * nie da się orzec, czy nuta 60 centów pod C to pomylone C, czy trafione H.
   * Rozrzut nasyca się wtedy na ok. 27 centów i przestaje nieść treść, a
   * offset i dryf liczone względem nieistniejącego centrum są bez znaczenia.
   * Wtedy uczciwiej powiedzieć „nie mam czego zmierzyć" niż podać liczbę.
   */
  tonalCenterFound: boolean
}

/**
 * Poziom istotności testu Rayleigha na jednorodność rozkładu kołowego.
 *
 * Hipoteza zerowa: odchyłki nut są rozrzucone równomiernie po okręgu, czyli
 * żaden strój ich nie tłumaczy. Statystyka n·R² ma wtedy w przybliżeniu rozkład
 * wykładniczy, więc p ≈ exp(−n·R²). Progowanie samego rozrzutu tu nie działa,
 * bo rozrzut nasyca się na ok. 27 centów i przestaje rozróżniać.
 */
const RAYLEIGH_ALPHA = 0.05

function rayleighPValue(concentration: number, sampleCount: number): number {
  return Math.exp(-sampleCount * concentration * concentration)
}

/**
 * Minimum, przy którym rozrzut jeszcze cokolwiek mierzy. Poniżej raportujemy
 * jawnie brak danych zamiast liczby, której nie da się obronić.
 */
const MIN_NOTES_FOR_REPORT = 4

/**
 * Odchyłka nuty od siatki półtonowej jest wielkością CYKLICZNĄ: żyje na okręgu
 * o obwodzie 100 centów, bo +60 centów i −40 centów to ta sama pozycja przy
 * innym zaokrągleniu. Statystyka liniowa na takiej wielkości zawodzi w obie
 * strony — mediana i MAD składają rozrzut z powrotem do środka, więc powyżej
 * ±50 centów rozrzut przestaje rosnąć, a przy dużym rozrzucie potrafi wręcz
 * zmaleć. Stąd trzeba wektora średniego, a nie średniej.
 *
 * `R` to długość wektora wypadkowego: 1 = wszystkie nuty odchylone identycznie
 * (jeden spójny strój), 0 = odchyłki rozrzucone równomiernie (brak centrum
 * tonalnego). Kąt wektora to offset.
 */
interface CircularStats {
  offsetCents: number
  concentration: number
}

function circularStats(noteMidis: number[]): CircularStats {
  let cosSum = 0
  let sinSum = 0

  for (const midi of noteMidis) {
    const phase = 2 * Math.PI * (midi - Math.floor(midi))
    cosSum += Math.cos(phase)
    sinSum += Math.sin(phase)
  }

  const cosMean = cosSum / noteMidis.length
  const sinMean = sinSum / noteMidis.length

  return {
    offsetCents: (Math.atan2(sinMean, cosMean) / (2 * Math.PI)) * 100,
    concentration: Math.hypot(cosMean, sinMean),
  }
}

/** Sprowadza cent do przedziału (−50, +50]. */
function wrapCents(cents: number): number {
  return (((cents + 50) % 100) + 100) % 100 - 50
}

/**
 * Rozrzut kołowy w centach. Dla małych rozrzutów pokrywa się z odchyleniem
 * standardowym (rozkład jednostajny ±30¢ → 18,6¢ wobec prawdziwych 17,3¢),
 * a przy pełnym rozsypaniu rośnie do sufitu zamiast się zawijać.
 */
const MAX_SPREAD_CENTS = 50

function circularSpreadCents(concentration: number): number {
  if (concentration <= 1e-6) return MAX_SPREAD_CENTS
  const spread = (100 * Math.sqrt(-2 * Math.log(concentration))) / (2 * Math.PI)
  return Math.min(MAX_SPREAD_CENTS, spread)
}

/**
 * Rozwinięcie reszt do ciągłego przebiegu. Dryf przekraczający 50 centów
 * przeskakuje na drugą stronę okręgu; bez rozwinięcia regresja liczy nachylenie
 * przez ten przeskok i zwraca liczbę bez związku z rzeczywistością.
 */
function unwrapCents(residuals: number[]): number[] {
  const unwrapped = [residuals[0]]
  let accumulated = 0

  for (let i = 1; i < residuals.length; i++) {
    const step = residuals[i] - residuals[i - 1]
    if (step > 50) accumulated -= 100
    else if (step < -50) accumulated += 100
    unwrapped.push(residuals[i] + accumulated)
  }

  return unwrapped
}

function linearSlope(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY)
    denominator += (xs[i] - meanX) ** 2
  }

  return denominator === 0 ? 0 : numerator / denominator
}

export function analyzeIntonation(pitchHistory: PitchData[]): IntonationReport {
  const notes = segmentIntoNotes(pitchHistory)

  if (notes.length < MIN_NOTES_FOR_REPORT) {
    return {
      offsetCents: 0,
      spreadCents: 0,
      driftCentsPerMinute: 0,
      intervalErrorCents: 0,
      noteCount: notes.length,
      vibratoShare: 0,
      insufficientData: true,
      tonalCenterFound: false,
    }
  }

  const midis = notes.map((n) => n.medianMidi)
  const { offsetCents, concentration } = circularStats(midis)
  const spreadCents = circularSpreadCents(concentration)

  const residuals = midis.map((m) => wrapCents((m - Math.floor(m)) * 100 - offsetCents))

  const startMs = notes[0].startMs
  const minutes = notes.map((n) => (n.startMs - startMs) / 60000)
  const driftCentsPerMinute = linearSlope(minutes, unwrapCents(residuals))

  // Interwał między kolejnymi nutami jest niezależny od offsetu, bo offset
  // odejmuje się w różnicy. To jedyna z czterech liczb, która mierzy słuch
  // relatywny, a nie trafianie w siatkę.
  const intervalDeviations: number[] = []
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].startMs - notes[i - 1].endMs > SILENCE_GAP_MS * 8) continue
    const interval = midis[i] - midis[i - 1]
    intervalDeviations.push(Math.abs(interval - Math.round(interval)) * 100)
  }
  const intervalErrorCents = intervalDeviations.length > 0 ? median(intervalDeviations) : 0

  const vibratoNotes = notes.filter(
    (n) => n.vibratoRateHz >= 4 && n.vibratoRateHz <= 8 && n.vibratoExtentCents >= 20,
  )

  return {
    offsetCents,
    spreadCents,
    driftCentsPerMinute,
    intervalErrorCents,
    noteCount: notes.length,
    vibratoShare: vibratoNotes.length / notes.length,
    insufficientData: false,
    tonalCenterFound: rayleighPValue(concentration, notes.length) < RAYLEIGH_ALPHA,
  }
}

// ----- Jedna liczba -----

/** Rozrzut, przy którym wynik cząstkowy to jeszcze 100. Eksperci uznają ±20–25¢ za „w stroju". */
const SPREAD_FLOOR_CENTS = 12
/** Rozrzut, przy którym wynik cząstkowy spada do zera. */
const SPREAD_CEILING_CENTS = 28
const INTERVAL_FLOOR_CENTS = 12
const INTERVAL_CEILING_CENTS = 45

function rampDown(value: number, floor: number, ceiling: number): number {
  if (value <= floor) return 100
  if (value >= ceiling) return 0
  return 100 * (1 - (value - floor) / (ceiling - floor))
}

export interface ScoreOptions {
  /**
   * Czy wykonanie jest przywiązane do stroju odniesienia (podkład, ćwiczenie
   * z tonem wzorcowym). Przy śpiewie a cappella offset transpozycyjny jest
   * normą, nie błędem, i NIE MOŻE obniżać wyniku — inaczej karzemy za rzecz,
   * której wyszkolony śpiewak nie uzna za pomyłkę.
   */
  referenceLocked?: boolean
}

/**
 * Wynik 0–100 na potrzeby gry i listy sesji.
 *
 * Świadomie NIE jest kalibrowany do populacji — na to potrzeba kilkuset ujęć,
 * których nie ma. To jest miara wewnętrznie porównywalna (ta sama osoba w
 * czasie), nie ocena bezwzględna.
 */
export function scoreIntonation(report: IntonationReport, options: ScoreOptions = {}): number | null {
  if (report.insufficientData) return null

  // Bez centrum tonalnego rozrzut jest nasycony i nie niesie już treści.
  // Liczba wyliczona z nasyconej wielkości potrafi drgnąć w GÓRĘ przy gorszym
  // wykonaniu, czyli powtórzyłaby wadę miary, którą ten moduł zastępuje.
  if (!report.tonalCenterFound) return null

  const stability = rampDown(report.spreadCents, SPREAD_FLOOR_CENTS, SPREAD_CEILING_CENTS)
  const intervals = rampDown(report.intervalErrorCents, INTERVAL_FLOOR_CENTS, INTERVAL_CEILING_CENTS)

  let score = 0.6 * stability + 0.4 * intervals

  if (options.referenceLocked) {
    // Przy podkładzie offset jest błędem, ale karą łagodną: 50 centów obniża
    // o połowę tego, co ten sam rozrzut.
    score *= rampDown(Math.abs(report.offsetCents), 10, 90) / 100
  }

  return Math.round(Math.max(0, Math.min(100, score)))
}

/**
 * Zdanie po polsku, które mówi CO poprawić. Zawsze dokładnie jedno —
 * najmocniejsza przesłanka wygrywa, reszta jest w liczbach obok.
 */
export function describeIntonation(report: IntonationReport): string {
  if (report.insufficientData) {
    return "Za krótkie nagranie, żeby cokolwiek zmierzyć — zaśpiewaj kilka nut."
  }

  const offset = Math.round(report.offsetCents)
  const spread = Math.round(report.spreadCents)
  const drift = Math.round(report.driftCentsPerMinute)
  const interval = Math.round(report.intervalErrorCents)

  if (spread >= 40) {
    return `Rozrzut ${spread} centów — poszczególne nuty rozjeżdżają się między sobą. To jest do poprawy w pierwszej kolejności.`
  }
  if (Math.abs(drift) >= 25) {
    return drift < 0
      ? `Opadasz o ${Math.abs(drift)} centów na minutę. Strój jest równy, ale całość osuwa się w dół.`
      : `Podnosisz się o ${drift} centów na minutę. Strój jest równy, ale całość pełznie w górę.`
  }
  if (interval >= 30) {
    return `Odległości między nutami mijają się o ${interval} centów — trafianie w pojedyncze nuty jest lepsze niż słyszenie interwałów.`
  }
  if (Math.abs(offset) >= 20) {
    return `Śpiewasz czysto, ale całość leży ${Math.abs(offset)} centów ${offset < 0 ? "nisko" : "wysoko"}. Przy a cappella to nie jest błąd.`
  }
  if (report.vibratoShare >= 0.3) {
    return `Czysto i równo, z vibratem na ${Math.round(report.vibratoShare * 100)}% nut.`
  }
  return `Czysto i równo — rozrzut ${spread} centów.`
}
