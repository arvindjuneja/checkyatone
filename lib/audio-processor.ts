// Audio processing utilities using Web Audio API

export interface AudioProcessingSettings {
  // Noise Gate / Compressor
  threshold: number // -100 to 0 dB
  ratio: number // 1 to 20
  attack: number // 0 to 1 seconds
  release: number // 0 to 1 seconds
  knee: number // 0 to 40 dB

  // EQ
  lowShelfGain: number // -12 to 12 dB
  midGain: number // -12 to 12 dB
  highShelfGain: number // -12 to 12 dB

  // Reverb
  reverbMix: number // 0 to 100 %

  // Overall gain
  outputGain: number // 0 to 2 (linear)
}

export const DEFAULT_SETTINGS: AudioProcessingSettings = {
  threshold: -24,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
  knee: 30,
  lowShelfGain: 0,
  midGain: 0,
  highShelfGain: 0,
  reverbMix: 0,
  outputGain: 1,
}

export const PRESETS: Record<string, { name: string; description: string; settings: AudioProcessingSettings }> = {
  podcast: {
    name: "Podcast Voice",
    description: "Clear, professional speaking voice with minimal background noise",
    settings: {
      threshold: -30,
      ratio: 6,
      attack: 0.003,
      release: 0.25,
      knee: 30,
      lowShelfGain: -3,
      midGain: 2,
      highShelfGain: 3,
      reverbMix: 5,
      outputGain: 1.2,
    },
  },
  studio: {
    name: "Studio Vocals",
    description: "Full, rich singing voice with professional polish",
    settings: {
      threshold: -24,
      ratio: 4,
      attack: 0.005,
      release: 0.3,
      knee: 20,
      lowShelfGain: 2,
      midGain: 1,
      highShelfGain: 2,
      reverbMix: 15,
      outputGain: 1.1,
    },
  },
  warm: {
    name: "Warm Tone",
    description: "Add warmth and depth to your voice",
    settings: {
      threshold: -20,
      ratio: 3,
      attack: 0.01,
      release: 0.4,
      knee: 25,
      lowShelfGain: 4,
      midGain: 0,
      highShelfGain: -2,
      reverbMix: 10,
      outputGain: 1.15,
    },
  },
  bright: {
    name: "Bright & Crisp",
    description: "Modern pop sound with clarity and presence",
    settings: {
      threshold: -28,
      ratio: 5,
      attack: 0.002,
      release: 0.2,
      knee: 35,
      lowShelfGain: -2,
      midGain: 3,
      highShelfGain: 5,
      reverbMix: 8,
      outputGain: 1.25,
    },
  },
  clean: {
    name: "Clean & Natural",
    description: "Minimal processing, just clean up the audio",
    settings: {
      threshold: -35,
      ratio: 2,
      attack: 0.01,
      release: 0.5,
      knee: 20,
      lowShelfGain: 0,
      midGain: 1,
      highShelfGain: 1,
      reverbMix: 0,
      outputGain: 1.0,
    },
  },
}

/**
 * Process audio with specified settings
 */
export async function processAudio(
  audioBlob: Blob,
  settings: AudioProcessingSettings
): Promise<Blob> {
  // Create audio context
  const audioContext = new AudioContext()

  // Decode audio data
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  // Create offline context for processing
  const offlineContext = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  )

  // Create source
  const source = offlineContext.createBufferSource()
  source.buffer = audioBuffer

  // 1. Compressor (acts as noise gate + dynamic range control)
  const compressor = offlineContext.createDynamicsCompressor()
  compressor.threshold.value = settings.threshold
  compressor.knee.value = settings.knee
  compressor.ratio.value = settings.ratio
  compressor.attack.value = settings.attack
  compressor.release.value = settings.release

  // 2. EQ - Low Shelf (bass)
  const lowShelf = offlineContext.createBiquadFilter()
  lowShelf.type = "lowshelf"
  lowShelf.frequency.value = 200
  lowShelf.gain.value = settings.lowShelfGain

  // 3. EQ - Peaking (mid)
  const midPeak = offlineContext.createBiquadFilter()
  midPeak.type = "peaking"
  midPeak.frequency.value = 1000
  midPeak.Q.value = 1
  midPeak.gain.value = settings.midGain

  // 4. EQ - High Shelf (treble)
  const highShelf = offlineContext.createBiquadFilter()
  highShelf.type = "highshelf"
  highShelf.frequency.value = 3000
  highShelf.gain.value = settings.highShelfGain

  // 5. Reverb (if enabled)
  let reverbNode: ConvolverNode | null = null
  let dryGain: GainNode | null = null
  let wetGain: GainNode | null = null

  if (settings.reverbMix > 0) {
    reverbNode = offlineContext.createConvolver()
    // Create simple impulse response for reverb
    reverbNode.buffer = createReverbImpulse(offlineContext, 2, 2)

    dryGain = offlineContext.createGain()
    wetGain = offlineContext.createGain()

    const mix = settings.reverbMix / 100
    dryGain.gain.value = 1 - mix
    wetGain.gain.value = mix
  }

  // 6. Output gain
  const outputGain = offlineContext.createGain()
  outputGain.gain.value = settings.outputGain

  // Connect processing chain
  source.connect(compressor)
  compressor.connect(lowShelf)
  lowShelf.connect(midPeak)
  midPeak.connect(highShelf)

  if (reverbNode && dryGain && wetGain) {
    // Split to dry and wet paths
    highShelf.connect(dryGain)
    highShelf.connect(reverbNode)
    reverbNode.connect(wetGain)

    // Merge and output
    dryGain.connect(outputGain)
    wetGain.connect(outputGain)
  } else {
    highShelf.connect(outputGain)
  }

  outputGain.connect(offlineContext.destination)

  // Process
  source.start()
  const processedBuffer = await offlineContext.startRendering()

  // Convert to blob
  const processedBlob = await audioBufferToWavBlob(processedBuffer)

  // Cleanup
  await audioContext.close()

  return processedBlob
}

/**
 * Create a simple reverb impulse response
 */
function createReverbImpulse(
  context: OfflineAudioContext,
  duration: number,
  decay: number
): AudioBuffer {
  const sampleRate = context.sampleRate
  const length = sampleRate * duration
  const impulse = context.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      // Exponentially decaying noise
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }

  return impulse
}

/**
 * Convert AudioBuffer to WAV Blob
 */
async function audioBufferToWavBlob(audioBuffer: AudioBuffer): Promise<Blob> {
  const numberOfChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  const bytesPerSample = bitDepth / 8
  const blockAlign = numberOfChannels * bytesPerSample

  const data = []
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = audioBuffer.getChannelData(channel)[i]
      // Convert float to 16-bit PCM
      const intSample = Math.max(-1, Math.min(1, sample))
      const pcmSample = intSample < 0 ? intSample * 0x8000 : intSample * 0x7fff
      data.push(pcmSample)
    }
  }

  const dataLength = data.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  // WAV header
  writeString(view, 0, "RIFF")
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, "WAVE")
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, format, true)
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, "data")
  view.setUint32(40, dataLength, true)

  // Write PCM data
  let offset = 44
  for (let i = 0; i < data.length; i++) {
    view.setInt16(offset, data[i], true)
    offset += 2
  }

  return new Blob([buffer], { type: "audio/wav" })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * Get waveform data for visualization
 */
export async function getWaveformData(
  audioBlob: Blob,
  samples: number = 1000
): Promise<Float32Array> {
  const audioContext = new AudioContext()
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  const channelData = audioBuffer.getChannelData(0)
  const blockSize = Math.floor(channelData.length / samples)
  const waveformData = new Float32Array(samples)

  for (let i = 0; i < samples; i++) {
    const start = blockSize * i
    let sum = 0
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(channelData[start + j])
    }
    waveformData[i] = sum / blockSize
  }

  await audioContext.close()
  return waveformData
}
