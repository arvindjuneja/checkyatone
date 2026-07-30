import { computeRms, detectF0, MAX_F0_HZ, MIN_F0_HZ } from "./yin"

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const A4_FREQUENCY = 440
const A4_NOTE_NUMBER = 69

export interface PitchData {
  frequency: number
  note: string
  octave: number
  cents: number // How many cents off from perfect pitch (-50 to +50)
  confidence: number
  timestamp: number
}

export function frequencyToNote(frequency: number): { note: string; octave: number; cents: number } {
  const noteNumber = 12 * Math.log2(frequency / A4_FREQUENCY) + A4_NOTE_NUMBER
  const roundedNote = Math.round(noteNumber)
  const cents = Math.round((noteNumber - roundedNote) * 100)
  const octave = Math.floor(roundedNote / 12) - 1
  const noteIndex = ((roundedNote % 12) + 12) % 12

  return {
    note: NOTE_NAMES[noteIndex],
    octave,
    cents,
  }
}

export function noteToFrequency(note: string, octave: number): number {
  const noteIndex = NOTE_NAMES.indexOf(note)
  if (noteIndex === -1) return 0
  const noteNumber = (octave + 1) * 12 + noteIndex
  return A4_FREQUENCY * Math.pow(2, (noteNumber - A4_NOTE_NUMBER) / 12)
}

/**
 * Detektor jest funkcją czystą — nie ma stanu do wyzerowania.
 *
 * Poprzednia wersja trzymała `previousFrequency` w module i używała go do
 * odrzucania skoków większych niż 5 półtonów. Skutek: pierwszy błąd oktawowy
 * zatrzaskiwał się na stałe, bo poprawna wysokość była od niego odległa o 12
 * półtonów i lądowała pod blokadą. Eksport zostaje dla zgodności z wołającymi.
 */
export function resetPitchTracking() {}

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  rmsThreshold = 0.001,
): { frequency: number; confidence: number } | null {
  if (computeRms(buffer) < rmsThreshold) return null

  const result = detectF0(buffer, sampleRate, {
    minFrequency: MIN_F0_HZ,
    maxFrequency: MAX_F0_HZ,
  })

  if (!result) return null

  // CMNDF poniżej 0,3 w wybranym tau, czyli confidence powyżej 0,7. Ramki, w
  // których nic nie przeszło progu bezwzględnego, wypadają właśnie tutaj.
  if (result.confidence < 0.7) return null

  return { frequency: result.frequency, confidence: result.confidence }
}

// Calculate vibrato from pitch data
export function detectVibrato(pitchHistory: PitchData[], windowMs = 500): { rate: number; extent: number } | null {
  if (pitchHistory.length < 10) return null

  const now = Date.now()
  const recentPitches = pitchHistory.filter((p) => now - p.timestamp < windowMs)

  if (recentPitches.length < 5) return null

  const frequencies = recentPitches.map((p) => p.frequency)
  const mean = frequencies.reduce((a, b) => a + b, 0) / frequencies.length

  // Calculate variation
  const variations = frequencies.map((f) => f - mean)

  // Count zero crossings to estimate rate
  let zeroCrossings = 0
  for (let i = 1; i < variations.length; i++) {
    if ((variations[i] >= 0 && variations[i - 1] < 0) || (variations[i] < 0 && variations[i - 1] >= 0)) {
      zeroCrossings++
    }
  }

  const duration = (recentPitches[recentPitches.length - 1].timestamp - recentPitches[0].timestamp) / 1000
  const rate = duration > 0 ? zeroCrossings / 2 / duration : 0

  // Calculate extent in cents
  const maxVariation = Math.max(...frequencies) - Math.min(...frequencies)
  const extent = (maxVariation / mean) * 1200 // Convert to cents

  return { rate, extent }
}

export function getPitchAccuracy(cents: number): "perfect" | "good" | "off" {
  const absCents = Math.abs(cents)
  if (absCents <= 10) return "perfect"
  if (absCents <= 25) return "good"
  return "off"
}
