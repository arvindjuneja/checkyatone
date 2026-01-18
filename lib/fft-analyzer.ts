/**
 * FFT utilities for harmonic analysis in Pro pitch detection mode.
 * Uses AnalyserNode's built-in FFT or manual computation as fallback.
 */

/**
 * Compute magnitude spectrum from time-domain audio buffer.
 * Uses a simple DFT for now - could be optimized with FFT algorithm if needed.
 */
export function computeFFTMagnitudes(
  buffer: Float32Array,
  fftSize: number = 2048
): Float32Array {
  const magnitudes = new Float32Array(fftSize / 2)

  // Apply Hanning window to reduce spectral leakage
  const windowedBuffer = new Float32Array(fftSize)
  for (let i = 0; i < Math.min(buffer.length, fftSize); i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)))
    windowedBuffer[i] = buffer[i] * window
  }

  // Compute DFT magnitudes for positive frequencies only
  for (let k = 0; k < fftSize / 2; k++) {
    let real = 0
    let imag = 0

    for (let n = 0; n < fftSize; n++) {
      const angle = -2 * Math.PI * k * n / fftSize
      real += windowedBuffer[n] * Math.cos(angle)
      imag += windowedBuffer[n] * Math.sin(angle)
    }

    magnitudes[k] = Math.sqrt(real * real + imag * imag) / fftSize
  }

  return magnitudes
}

/**
 * Get magnitude at a specific frequency from FFT magnitudes.
 * Uses linear interpolation between bins for better accuracy.
 */
export function getMagnitudeAtFrequency(
  magnitudes: Float32Array,
  frequency: number,
  sampleRate: number,
  fftSize: number
): number {
  const bin = frequency * fftSize / sampleRate
  const lowerBin = Math.floor(bin)
  const upperBin = Math.ceil(bin)

  if (lowerBin < 0 || upperBin >= magnitudes.length) {
    return 0
  }

  if (lowerBin === upperBin) {
    return magnitudes[lowerBin]
  }

  // Linear interpolation
  const fraction = bin - lowerBin
  return magnitudes[lowerBin] * (1 - fraction) + magnitudes[upperBin] * fraction
}

/**
 * Find harmonic peaks in the spectrum for a given fundamental frequency.
 * Returns array of magnitudes at f0, 2*f0, 3*f0, etc.
 */
export function findHarmonicPeaks(
  magnitudes: Float32Array,
  f0: number,
  sampleRate: number,
  fftSize: number,
  numHarmonics: number = 6
): number[] {
  const harmonicMagnitudes: number[] = []

  for (let n = 1; n <= numHarmonics; n++) {
    const harmonicFreq = f0 * n

    // Skip if harmonic is above Nyquist
    if (harmonicFreq >= sampleRate / 2) {
      break
    }

    // Get magnitude at this harmonic, checking nearby bins for peak
    const binWidth = sampleRate / fftSize
    const searchRange = Math.ceil(binWidth * 2 / f0) // Search within ~2 bins

    let maxMagnitude = 0
    for (let offset = -searchRange; offset <= searchRange; offset++) {
      const searchFreq = harmonicFreq + offset * binWidth * 0.5
      const mag = getMagnitudeAtFrequency(magnitudes, searchFreq, sampleRate, fftSize)
      if (mag > maxMagnitude) {
        maxMagnitude = mag
      }
    }

    harmonicMagnitudes.push(maxMagnitude)
  }

  return harmonicMagnitudes
}

/**
 * Compute total harmonic energy for an F0 candidate.
 * Weights lower harmonics more heavily (1/n weighting).
 */
export function computeHarmonicEnergy(
  magnitudes: Float32Array,
  f0: number,
  sampleRate: number,
  fftSize: number,
  numHarmonics: number = 6
): number {
  const harmonicMags = findHarmonicPeaks(magnitudes, f0, sampleRate, fftSize, numHarmonics)

  let energy = 0
  for (let i = 0; i < harmonicMags.length; i++) {
    // Weight lower harmonics more (1/n weighting)
    energy += harmonicMags[i] / (i + 1)
  }

  return energy
}

/**
 * Compute harmonic-to-inharmonic ratio for an F0 candidate.
 * Higher ratio indicates the F0 better explains the spectrum.
 */
export function computeHarmonicRatio(
  magnitudes: Float32Array,
  f0: number,
  sampleRate: number,
  fftSize: number,
  numHarmonics: number = 6
): number {
  const harmonicMags = findHarmonicPeaks(magnitudes, f0, sampleRate, fftSize, numHarmonics)

  // Sum of harmonic energy
  let harmonicEnergy = 0
  for (const mag of harmonicMags) {
    harmonicEnergy += mag * mag
  }

  // Total energy in spectrum
  let totalEnergy = 0
  for (let i = 0; i < magnitudes.length; i++) {
    totalEnergy += magnitudes[i] * magnitudes[i]
  }

  if (totalEnergy < 1e-10) {
    return 0
  }

  return harmonicEnergy / totalEnergy
}
