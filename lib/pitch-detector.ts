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

let previousFrequency: number | null = null
let frequencyHistory: number[] = []
const HISTORY_SIZE = 5

export function resetPitchTracking() {
  previousFrequency = null
  frequencyHistory = []
}

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  rmsThreshold = 0.001,
): { frequency: number; confidence: number } | null {
  const SIZE = buffer.length
  const MIN_FREQUENCY = 65 // C2
  const MAX_FREQUENCY = 2100 // ~C7
  const MIN_PERIOD = Math.floor(sampleRate / MAX_FREQUENCY)
  const MAX_PERIOD = Math.floor(sampleRate / MIN_FREQUENCY)

  // Calculate RMS
  let rms = 0
  for (let i = 0; i < SIZE; i++) {
    rms += buffer[i] * buffer[i]
  }
  rms = Math.sqrt(rms / SIZE)

  if (rms < rmsThreshold) return null

  // YIN algorithm - difference function
  const yinBuffer = new Float32Array(MAX_PERIOD)

  for (let tau = 0; tau < MAX_PERIOD; tau++) {
    yinBuffer[tau] = 0
    for (let i = 0; i < MAX_PERIOD; i++) {
      if (i + tau < SIZE) {
        const delta = buffer[i] - buffer[i + tau]
        yinBuffer[tau] += delta * delta
      }
    }
  }

  // Cumulative mean normalized difference
  yinBuffer[0] = 1
  let runningSum = 0
  for (let tau = 1; tau < MAX_PERIOD; tau++) {
    runningSum += yinBuffer[tau]
    yinBuffer[tau] *= tau / runningSum
  }

  const threshold = 0.25 // Stricter threshold to reduce false positives
  const candidates: { tau: number; value: number }[] = []

  for (let tau = MIN_PERIOD; tau < MAX_PERIOD - 1; tau++) {
    if (yinBuffer[tau] < threshold) {
      if (yinBuffer[tau] < yinBuffer[tau - 1] && yinBuffer[tau] <= yinBuffer[tau + 1]) {
        candidates.push({ tau, value: yinBuffer[tau] })
      }
    }
  }

  if (candidates.length === 0) return null

  // Convert all candidates to frequencies
  const candidateFreqs = candidates.map((c) => ({
    ...c,
    freq: sampleRate / c.tau,
  }))

  // CRITICAL: Filter out harmonics by preferring the lowest frequency (fundamental)
  // Remove candidates that are near-perfect octaves of lower candidates
  const filteredCandidates = candidateFreqs.filter((candidate, idx) => {
    // Check if this candidate is a harmonic of a lower frequency candidate
    for (let i = 0; i < idx; i++) {
      const ratio = candidate.freq / candidateFreqs[i].freq
      // Check if it's close to 2x, 3x, 4x (harmonics)
      if (
        Math.abs(ratio - 2) < 0.05 || 
        Math.abs(ratio - 3) < 0.05 || 
        Math.abs(ratio - 4) < 0.05
      ) {
        return false // This is a harmonic, filter it out
      }
    }
    return true
  })

  let bestCandidate = filteredCandidates.length > 0 ? filteredCandidates[0] : candidateFreqs[0]

  if (previousFrequency !== null && filteredCandidates.length > 1) {
    // Strongly prefer candidates close to the previous frequency
    let minScore = Number.POSITIVE_INFINITY
    
    for (const c of filteredCandidates) {
      let semitoneDistance = Math.abs(12 * Math.log2(c.freq / previousFrequency))
      
      // Penalize octave jumps heavily
      const octaveRemainder = semitoneDistance % 12
      if (octaveRemainder < 1 || octaveRemainder > 11) {
        // This is an octave jump - check if we should fold it back
        const octaves = Math.round(semitoneDistance / 12)
        if (octaves > 0) {
          // Heavily penalize octave jumps to prevent harmonic detection
          semitoneDistance = octaveRemainder + octaves * 15
        } else {
          semitoneDistance = Math.min(octaveRemainder, 12 - octaveRemainder)
        }
      }
      
      // Prefer lower YIN values (higher confidence) and closer frequencies
      const score = semitoneDistance * 3.0 + c.value * 20

      if (score < minScore) {
        minScore = score
        bestCandidate = c
      }
    }
  } else if (filteredCandidates.length > 0) {
    // When no previous frequency, prefer the lowest frequency (fundamental) with good confidence
    bestCandidate = filteredCandidates.reduce((a, b) => {
      // Prefer lower frequency if confidence is similar
      if (Math.abs(a.value - b.value) < 0.05) {
        return a.freq < b.freq ? a : b
      }
      return a.value < b.value ? a : b
    })
  }

  const tau = bestCandidate.tau

  // Parabolic interpolation
  let betterTau = tau
  if (tau > 0 && tau < MAX_PERIOD - 1) {
    const s0 = yinBuffer[tau - 1]
    const s1 = yinBuffer[tau]
    const s2 = yinBuffer[tau + 1]
    const denom = 2 * (2 * s1 - s2 - s0)
    if (Math.abs(denom) > 0.0001) {
      betterTau = tau + (s2 - s0) / denom
    }
  }

  const frequency = sampleRate / betterTau
  const confidence = 1 - yinBuffer[tau]

  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
    return null
  }

  // Require higher confidence to reduce false detections
  if (confidence < 0.7) {
    return null
  }

  // Additional harmonic check: if we have previous frequency, 
  // reject if this is clearly a harmonic
  if (previousFrequency !== null) {
    const ratio = frequency / previousFrequency
    const reverseRatio = previousFrequency / frequency
    
    // Check if current frequency is a harmonic of previous (2x, 3x, 4x)
    if (
      Math.abs(ratio - 2) < 0.08 || 
      Math.abs(ratio - 3) < 0.08 || 
      Math.abs(ratio - 4) < 0.08 ||
      Math.abs(reverseRatio - 2) < 0.08 ||
      Math.abs(reverseRatio - 3) < 0.08 ||
      Math.abs(reverseRatio - 4) < 0.08
    ) {
      // This looks like a harmonic jump - prefer the previous frequency region
      // Only accept if the jump is small (within 5 semitones)
      const semitones = Math.abs(12 * Math.log2(frequency / previousFrequency))
      if (semitones > 5) {
        return null
      }
    }
  }

  frequencyHistory.push(frequency)
  if (frequencyHistory.length > HISTORY_SIZE) {
    frequencyHistory.shift()
  }

  if (frequencyHistory.length >= 3) {
    const sorted = [...frequencyHistory].sort((a, b) => a - b)
    previousFrequency = sorted[Math.floor(sorted.length / 2)]
  } else {
    previousFrequency = frequency
  }

  return { frequency, confidence }
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
