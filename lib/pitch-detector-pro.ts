/**
 * Pro Pitch Detector: Multi-Hypothesis F0 Detection
 *
 * Uses YIN for candidate generation, then scores each candidate using:
 * - Harmonic consistency (does this F0 explain the spectrum?)
 * - Temporal stability (is this consistent with recent pitches?)
 * - User range match (is this within the user's vocal range?)
 * - YIN confidence (original detection confidence)
 *
 * Winner = highest combined score (not highest energy).
 */

import { computeFFTMagnitudes, computeHarmonicEnergy } from "./fft-analyzer"
import type { PitchData } from "./pitch-detector"
import { frequencyToNote } from "./pitch-detector"

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

// ----- Scoring weights -----

const WEIGHTS = {
  harmonicConsistency: 0.4,
  temporalStability: 0.3,
  userRangeMatch: 0.2,
  confidenceScore: 0.1,
}

// ----- State for temporal tracking -----

const STABILITY_WINDOW = 10
let recentF0s: number[] = []
let previousFrequencyPro: number | null = null

export function resetProPitchTracking() {
  recentF0s = []
  previousFrequencyPro = null
}

// ----- Scoring Functions -----

/**
 * Score how well the F0 explains the harmonic structure.
 * A true fundamental will have strong energy at harmonics.
 */
function getHarmonicConsistencyScore(
  f0: number,
  fftMagnitudes: Float32Array,
  sampleRate: number,
  fftSize: number
): number {
  // Get harmonic energy for this candidate
  const energy = computeHarmonicEnergy(fftMagnitudes, f0, sampleRate, fftSize, 6)

  // Also check energy at f0/2 (potential subharmonic)
  const subharmonicEnergy = f0 >= 100
    ? computeHarmonicEnergy(fftMagnitudes, f0 / 2, sampleRate, fftSize, 6)
    : 0

  // Also check energy at f0*2 (potential octave-above fundamental)
  const octaveAboveEnergy = computeHarmonicEnergy(fftMagnitudes, f0 * 2, sampleRate, fftSize, 6)

  // If subharmonic or octave-above has stronger harmonic structure, penalize
  if (subharmonicEnergy > energy * 1.2) {
    return 0.3 // This might be a subharmonic
  }
  if (octaveAboveEnergy > energy * 1.5) {
    return 0.4 // This might be octave too low
  }

  // Normalize energy to 0-1 range (heuristic normalization)
  // Higher energy relative to alternatives = higher score
  const maxEnergy = Math.max(energy, subharmonicEnergy, octaveAboveEnergy, 0.001)
  return Math.min(1, energy / maxEnergy)
}

/**
 * Score temporal stability - penalize sudden jumps.
 * Real pitch is relatively stable frame-to-frame.
 */
function getTemporalStabilityScore(f0: number): number {
  if (recentF0s.length < 3) {
    return 0.5 // Neutral if not enough history
  }

  // Calculate average semitone distance from recent pitches
  const semitoneDistances = recentF0s.map((prev) =>
    Math.abs(12 * Math.log2(f0 / prev))
  )

  const avgDistance = semitoneDistances.reduce((a, b) => a + b, 0) / semitoneDistances.length

  // Lower average distance = more stable = higher score
  // 0 semitones avg -> score 1.0
  // 12 semitones avg (octave jump) -> score 0.0
  return Math.max(0, 1 - avgDistance / 12)
}

/**
 * Score match to user's observed vocal range.
 * If user always sings 150-400Hz, suddenly showing 75Hz is likely subharmonic.
 */
function getUserRangeScore(f0: number, profile: VoiceProfile | null): number {
  if (!profile || profile.sampleCount < 50) {
    return 0.5 // Neutral if no profile or not enough data
  }

  // Check if f0 is within user's observed range
  if (f0 >= profile.minF0 && f0 <= profile.maxF0) {
    // Within range - score based on distance from comfortable center
    const semitoneFromCenter = Math.abs(12 * Math.log2(f0 / profile.comfortableF0))
    return Math.max(0.3, 1 - semitoneFromCenter / 24) // 2 octaves = min score
  }

  // Outside observed range - likely octave error
  const semitoneOutside = f0 < profile.minF0
    ? 12 * Math.log2(profile.minF0 / f0)
    : 12 * Math.log2(f0 / profile.maxF0)

  return Math.max(0, 0.3 - semitoneOutside / 12) // Penalize heavily
}

// ----- YIN Candidate Extraction -----

interface YINCandidate {
  tau: number
  frequency: number
  confidence: number // 1 - yinValue
}

function getYINCandidates(
  buffer: Float32Array,
  sampleRate: number,
  minFrequency: number = 65,
  maxFrequency: number = 2100,
  yinThreshold: number = 0.35
): YINCandidate[] {
  const SIZE = buffer.length
  const MIN_PERIOD = Math.floor(sampleRate / maxFrequency)
  const MAX_PERIOD = Math.floor(sampleRate / minFrequency)

  // YIN difference function
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

  // Find all local minima below threshold
  const candidates: YINCandidate[] = []

  for (let tau = MIN_PERIOD; tau < MAX_PERIOD - 1; tau++) {
    if (yinBuffer[tau] < yinThreshold) {
      if (yinBuffer[tau] < yinBuffer[tau - 1] && yinBuffer[tau] <= yinBuffer[tau + 1]) {
        // Parabolic interpolation for better precision
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

        if (frequency >= minFrequency && frequency <= maxFrequency) {
          candidates.push({ tau: betterTau, frequency, confidence })
        }
      }
    }
  }

  return candidates
}

// ----- Main Detection Function -----

export function detectPitchPro(
  buffer: Float32Array,
  sampleRate: number,
  options: ProDetectorOptions = {}
): { frequency: number; confidence: number; candidates: PitchCandidate[] } | null {
  const { rmsThreshold = 0.001, voiceProfile = null } = options

  // Calculate RMS
  let rms = 0
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i]
  }
  rms = Math.sqrt(rms / buffer.length)

  if (rms < rmsThreshold) {
    return null
  }

  // Get YIN candidates
  const yinCandidates = getYINCandidates(buffer, sampleRate)

  if (yinCandidates.length === 0) {
    return null
  }

  // Compute FFT for harmonic analysis
  const fftSize = 2048
  const fftMagnitudes = computeFFTMagnitudes(buffer, fftSize)

  // Score each candidate
  const scoredCandidates: PitchCandidate[] = yinCandidates.map((candidate) => {
    const harmonicScore = getHarmonicConsistencyScore(
      candidate.frequency,
      fftMagnitudes,
      sampleRate,
      fftSize
    )
    const stabilityScore = getTemporalStabilityScore(candidate.frequency)
    const rangeScore = getUserRangeScore(candidate.frequency, voiceProfile)
    const confidenceScore = candidate.confidence

    const finalScore =
      WEIGHTS.harmonicConsistency * harmonicScore +
      WEIGHTS.temporalStability * stabilityScore +
      WEIGHTS.userRangeMatch * rangeScore +
      WEIGHTS.confidenceScore * confidenceScore

    return {
      frequency: candidate.frequency,
      confidence: candidate.confidence,
      harmonicScore,
      stabilityScore,
      rangeScore,
      finalScore,
    }
  })

  // Sort by final score (highest first)
  scoredCandidates.sort((a, b) => b.finalScore - a.finalScore)

  // Winner is highest scoring candidate
  const winner = scoredCandidates[0]

  // Require minimum confidence
  if (winner.confidence < 0.6) {
    return null
  }

  // Update temporal tracking
  recentF0s.push(winner.frequency)
  if (recentF0s.length > STABILITY_WINDOW) {
    recentF0s.shift()
  }
  previousFrequencyPro = winner.frequency

  // Return top 3 candidates for debugging UI
  const topCandidates = scoredCandidates.slice(0, 3)

  return {
    frequency: winner.frequency,
    confidence: winner.confidence,
    candidates: topCandidates,
  }
}

/**
 * Full pitch detection with note conversion for Pro mode.
 */
export function detectPitchProWithNote(
  buffer: Float32Array,
  sampleRate: number,
  options: ProDetectorOptions = {}
): PitchDataPro | null {
  const result = detectPitchPro(buffer, sampleRate, options)

  if (!result) {
    return null
  }

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
