/**
 * Rdzeń detekcji F0: YIN (de Cheveigné & Kawahara 2002).
 *
 * Jedna implementacja dla obu trybów. Trzy rzeczy, które muszą tu być zrobione
 * dobrze, bo każda z nich osobno produkuje błąd oktawowy:
 *
 * 1. STAŁE OKNO CAŁKOWANIA. Funkcja różnicy sumuje zawsze `W` składników,
 *    niezależnie od tau. Skracanie okna wraz z rosnącym tau zaniża d(tau) dla
 *    dużych tau, czyli wprost premiuje subharmoniczne.
 *
 * 2. PRÓG BEZWZGLĘDNY, NIE GLOBALNE MINIMUM (krok 4 pracy źródłowej). Dla
 *    sygnału okresowego CMNDF ma minima w tau = T, 2T, 3T... i te dalsze bywają
 *    głębsze. Poprawną odpowiedzią jest NAJMNIEJSZE tau z minimum poniżej progu.
 *    Wybieranie najgłębszego minimum to dokładnie definicja błędu oktawowego.
 *
 * 3. INTERPOLACJA PARABOLICZNA po wyborze tau, nie przed.
 */

export const MIN_F0_HZ = 65 // C2
export const MAX_F0_HZ = 2100 // ~C7

/**
 * Powyżej tej częstotliwości próbkowania dziesiątkujemy przed analizą.
 * Powód: przy 96 kHz okres C2 to 1476 próbek, więc w buforze 2048 nie mieszczą
 * się nawet dwa okresy i funkcja różnicy nie ma czego porównywać. To jest
 * mechanizm spadku o oktawę na interfejsach studyjnych.
 */
const DECIMATION_TARGET_HZ = 48000

export interface YinResult {
  /** Częstotliwość w Hz. */
  frequency: number
  /** 1 − CMNDF w wybranym tau. Im bliżej 1, tym bardziej okresowy sygnał. */
  confidence: number
  /** Okres w próbkach, po interpolacji, w dziedzinie po ewentualnym dziesiątkowaniu. */
  tau: number
  /** Częstotliwość próbkowania faktycznie użyta do analizy. */
  analysisSampleRate: number
  /** Znormalizowana funkcja różnicy — potrzebna do sprawdzania hipotez oktawowych. */
  cmndf: Float32Array
}

// ----- Dziesiątkowanie -----

/**
 * FIR dolnoprzepustowy typu windowed-sinc, projektowany raz na współczynnik.
 * Bez niego dziesiątkowanie zawija harmoniczne w pasmo analizy.
 */
const firCache = new Map<number, Float32Array>()

function designDecimationFir(factor: number): Float32Array {
  const cached = firCache.get(factor)
  if (cached) return cached

  const taps = 8 * factor + 1
  const center = (taps - 1) / 2
  // Zapas 10% poniżej nowej częstotliwości Nyquista.
  const cutoff = 0.45 / factor
  const fir = new Float32Array(taps)

  let sum = 0
  for (let i = 0; i < taps; i++) {
    const n = i - center
    const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n)
    // Okno Hamminga
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (taps - 1))
    fir[i] = sinc * window
    sum += fir[i]
  }
  for (let i = 0; i < taps; i++) fir[i] /= sum

  firCache.set(factor, fir)
  return fir
}

function decimate(buffer: Float32Array, factor: number): Float32Array {
  const fir = designDecimationFir(factor)
  const half = (fir.length - 1) / 2
  const outputLength = Math.floor(buffer.length / factor)
  const output = new Float32Array(outputLength)

  for (let o = 0; o < outputLength; o++) {
    const center = o * factor
    let acc = 0
    for (let k = 0; k < fir.length; k++) {
      const index = center + k - half
      if (index >= 0 && index < buffer.length) acc += buffer[index] * fir[k]
    }
    output[o] = acc
  }

  return output
}

// ----- Rdzeń -----

export function computeRms(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

/**
 * Znormalizowana skumulowana funkcja różnicy, równania (6)–(8) pracy źródłowej.
 * `W` jest stałe dla każdego tau — to jest ta poprawka z punktu 1 nagłówka.
 */
function computeCmndf(buffer: Float32Array, maxPeriod: number): Float32Array {
  const integrationWindow = buffer.length - maxPeriod
  const cmndf = new Float32Array(maxPeriod + 1)

  if (integrationWindow <= 0) {
    cmndf.fill(1)
    return cmndf
  }

  const difference = new Float32Array(maxPeriod + 1)
  for (let tau = 1; tau <= maxPeriod; tau++) {
    let acc = 0
    for (let i = 0; i < integrationWindow; i++) {
      const delta = buffer[i] - buffer[i + tau]
      acc += delta * delta
    }
    difference[tau] = acc
  }

  cmndf[0] = 1
  let runningSum = 0
  for (let tau = 1; tau <= maxPeriod; tau++) {
    runningSum += difference[tau]
    cmndf[tau] = runningSum === 0 ? 1 : (difference[tau] * tau) / runningSum
  }

  return cmndf
}

function parabolicRefine(cmndf: Float32Array, tau: number): number {
  if (tau <= 0 || tau >= cmndf.length - 1) return tau
  const s0 = cmndf[tau - 1]
  const s1 = cmndf[tau]
  const s2 = cmndf[tau + 1]
  const denominator = 2 * (2 * s1 - s0 - s2)
  if (Math.abs(denominator) < 1e-9) return tau
  const shift = (s2 - s0) / denominator
  // Wierzchołek paraboli poza sąsiednimi próbkami oznacza, że dopasowanie jest
  // bez sensu — wtedy zostajemy przy próbce całkowitej.
  return Math.abs(shift) > 1 ? tau : tau + shift
}

export interface YinOptions {
  /**
   * Próg bezwzględny. Praca źródłowa podaje 0,1; implementacje praktyczne
   * 0,10–0,20. Luźniejszy próg wpuszcza przypadkowe wczesne minima, czyli
   * błędy oktawę W GÓRĘ.
   */
  threshold?: number
  minFrequency?: number
  maxFrequency?: number
}

export function detectF0(
  buffer: Float32Array,
  sampleRate: number,
  options: YinOptions = {},
): YinResult | null {
  const {
    threshold = 0.15,
    minFrequency = MIN_F0_HZ,
    maxFrequency = MAX_F0_HZ,
  } = options

  let analysisBuffer = buffer
  let analysisSampleRate = sampleRate

  if (sampleRate > DECIMATION_TARGET_HZ * 1.5) {
    const factor = Math.max(2, Math.round(sampleRate / DECIMATION_TARGET_HZ))
    analysisBuffer = decimate(buffer, factor)
    analysisSampleRate = sampleRate / factor
  }

  const minPeriod = Math.max(2, Math.floor(analysisSampleRate / maxFrequency))
  const maxPeriod = Math.floor(analysisSampleRate / minFrequency)

  // Potrzebujemy miejsca i na tau, i na okno całkowania.
  if (analysisBuffer.length <= maxPeriod + minPeriod) return null

  const cmndf = computeCmndf(analysisBuffer, maxPeriod)

  // Krok 4: pierwsze minimum lokalne poniżej progu wygrywa. Nie najgłębsze.
  let chosenTau = -1
  for (let tau = minPeriod; tau < maxPeriod; tau++) {
    if (cmndf[tau] >= threshold) continue
    // Zejdź na dno tego zagłębienia, żeby interpolacja miała sensowny wierzchołek.
    let local = tau
    while (local + 1 < maxPeriod && cmndf[local + 1] < cmndf[local]) local++
    chosenTau = local
    break
  }

  // Nic nie przeszło progu: bierzemy globalne minimum, ale sygnalizujemy to
  // niską pewnością, żeby warstwa wyżej mogła odrzucić ramkę.
  if (chosenTau === -1) {
    let bestTau = minPeriod
    for (let tau = minPeriod; tau < maxPeriod; tau++) {
      if (cmndf[tau] < cmndf[bestTau]) bestTau = tau
    }
    chosenTau = bestTau
  }

  const refinedTau = parabolicRefine(cmndf, chosenTau)
  if (refinedTau <= 0) return null

  const frequency = analysisSampleRate / refinedTau
  if (frequency < minFrequency || frequency > maxFrequency) return null

  return {
    frequency,
    confidence: 1 - cmndf[chosenTau],
    tau: refinedTau,
    analysisSampleRate,
    cmndf,
  }
}

// ----- Goertzel: energia w pojedynczym prążku -----

const hannCache = new Map<number, Float32Array>()

/**
 * Okno Hanna, liczone raz na długość bufora.
 *
 * Wymagane przed Goertzelem, jeśli sprawdzamy OBECNOŚĆ prążka. Na oknie
 * prostokątnym listki boczne silnej harmonicznej sięgają −29 dB dziewięć
 * prążków dalej, czyli powyżej progu obecności — puste miejsca w widmie
 * wyglądają wtedy jak zajęte i hipoteza subharmoniczna dostaje pełną punktację.
 */
export function applyHannWindow(buffer: Float32Array): Float32Array {
  let window = hannCache.get(buffer.length)
  if (!window) {
    window = new Float32Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (buffer.length - 1))
    }
    hannCache.set(buffer.length, window)
  }

  const windowed = new Float32Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) windowed[i] = buffer[i] * window[i]
  return windowed
}

/**
 * Amplituda pojedynczej częstotliwości, koszt O(N) na prążek.
 *
 * Zastępuje pełne DFT tam, gdzie interesuje nas kilkanaście konkretnych
 * częstotliwości (harmoniczne hipotezy F0). Naiwne DFT 2048-punktowe kosztowało
 * 26,9 ms na ramkę — tu potrzeba ~16 prążków, czyli dwa rzędy wielkości mniej.
 */
export function goertzelMagnitude(
  buffer: Float32Array,
  sampleRate: number,
  frequency: number,
): number {
  if (frequency <= 0 || frequency >= sampleRate / 2) return 0

  const omega = (2 * Math.PI * frequency) / sampleRate
  const coefficient = 2 * Math.cos(omega)

  let s1 = 0
  let s2 = 0
  for (let i = 0; i < buffer.length; i++) {
    const s0 = buffer[i] + coefficient * s1 - s2
    s2 = s1
    s1 = s0
  }

  const real = s1 - s2 * Math.cos(omega)
  const imaginary = s2 * Math.sin(omega)
  return Math.sqrt(real * real + imaginary * imaginary) / buffer.length
}
