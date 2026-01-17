// Per-track audio processing with EQ and automation support

import type { TrackProcessing } from './multi-track-storage'
import type { AutomationLane, AutomationParameter } from './automation'
import { getValueAtTime, denormalizeValue } from './automation'

export interface TrackProcessorNodes {
  input: GainNode
  eqLow: BiquadFilterNode
  eqMid: BiquadFilterNode
  eqHigh: BiquadFilterNode
  volume: GainNode
  pan: StereoPannerNode
  output: GainNode
}

/**
 * Create a per-track audio processing chain
 * Audio flow: input -> eqLow -> eqMid -> eqHigh -> volume -> pan -> output
 */
export function createTrackProcessor(audioContext: AudioContext): TrackProcessorNodes {
  // Input gain (pre-processing)
  const input = audioContext.createGain()
  input.gain.value = 1

  // 3-band EQ using biquad filters
  // Low shelf: boosts/cuts frequencies below 320Hz
  const eqLow = audioContext.createBiquadFilter()
  eqLow.type = 'lowshelf'
  eqLow.frequency.value = 320
  eqLow.gain.value = 0

  // Mid peaking: boosts/cuts frequencies around 1kHz
  const eqMid = audioContext.createBiquadFilter()
  eqMid.type = 'peaking'
  eqMid.frequency.value = 1000
  eqMid.Q.value = 1
  eqMid.gain.value = 0

  // High shelf: boosts/cuts frequencies above 3.2kHz
  const eqHigh = audioContext.createBiquadFilter()
  eqHigh.type = 'highshelf'
  eqHigh.frequency.value = 3200
  eqHigh.gain.value = 0

  // Volume control (post-EQ)
  const volume = audioContext.createGain()
  volume.gain.value = 1

  // Stereo panner
  const pan = audioContext.createStereoPanner()
  pan.pan.value = 0

  // Output gain
  const output = audioContext.createGain()
  output.gain.value = 1

  // Connect the chain
  input.connect(eqLow)
  eqLow.connect(eqMid)
  eqMid.connect(eqHigh)
  eqHigh.connect(volume)
  volume.connect(pan)
  pan.connect(output)

  return {
    input,
    eqLow,
    eqMid,
    eqHigh,
    volume,
    pan,
    output,
  }
}

/**
 * Apply static processing settings to a track processor
 */
export function applyProcessingSettings(
  nodes: TrackProcessorNodes,
  processing: TrackProcessing | undefined,
  trackVolume: number,
  trackPan: number,
  isMuted: boolean
): void {
  // Apply EQ settings if processing is enabled
  if (processing?.enabled) {
    nodes.eqLow.gain.value = processing.eqLow
    nodes.eqMid.gain.value = processing.eqMid
    nodes.eqHigh.gain.value = processing.eqHigh
  } else {
    // Reset EQ to neutral
    nodes.eqLow.gain.value = 0
    nodes.eqMid.gain.value = 0
    nodes.eqHigh.gain.value = 0
  }

  // Apply volume and pan
  nodes.volume.gain.value = isMuted ? 0 : trackVolume
  nodes.pan.pan.value = trackPan
}

// Debug: track how often we log (to avoid spamming console)
let lastLogTime = 0

/**
 * Apply automation values at a specific time
 */
export function applyAutomationAtTime(
  nodes: TrackProcessorNodes,
  automationLanes: AutomationLane[],
  time: number,
  baseVolume: number,
  basePan: number,
  baseProcessing: TrackProcessing | undefined,
  isMuted: boolean,
  audioContext: AudioContext
): void {
  // Start with base values
  let volume = baseVolume
  let pan = basePan
  let eqLow = baseProcessing?.eqLow ?? 0
  let eqMid = baseProcessing?.eqMid ?? 0
  let eqHigh = baseProcessing?.eqHigh ?? 0

  // Track which lanes have automation
  const appliedAutomation: string[] = []

  // Apply automation for each parameter
  for (const lane of automationLanes) {
    if (!lane.visible || lane.points.length === 0) continue

    const normalizedValue = getValueAtTime(lane, time)
    appliedAutomation.push(`${lane.parameter}=${normalizedValue.toFixed(2)}`)

    switch (lane.parameter) {
      case 'volume':
        volume = denormalizeValue('volume', normalizedValue)
        break
      case 'pan':
        pan = denormalizeValue('pan', normalizedValue)
        break
      case 'eqLow':
        eqLow = denormalizeValue('eqLow', normalizedValue)
        break
      case 'eqMid':
        eqMid = denormalizeValue('eqMid', normalizedValue)
        break
      case 'eqHigh':
        eqHigh = denormalizeValue('eqHigh', normalizedValue)
        break
    }
  }

  // Debug log once per second
  const now = Date.now()
  if (now - lastLogTime > 1000 && appliedAutomation.length > 0) {
    console.log(`[Automation] t=${time.toFixed(2)}s: ${appliedAutomation.join(', ')} -> vol=${volume.toFixed(2)}, pan=${pan.toFixed(2)}`)
    lastLogTime = now
  }

  // Apply values smoothly using setTargetAtTime for glitch-free automation
  const currentTime = audioContext.currentTime
  const smoothingTime = 0.02 // 20ms smoothing

  nodes.volume.gain.setTargetAtTime(
    isMuted ? 0 : volume,
    currentTime,
    smoothingTime
  )
  nodes.pan.pan.setTargetAtTime(pan, currentTime, smoothingTime)

  // Apply EQ if processing is enabled
  if (baseProcessing?.enabled) {
    nodes.eqLow.gain.setTargetAtTime(eqLow, currentTime, smoothingTime)
    nodes.eqMid.gain.setTargetAtTime(eqMid, currentTime, smoothingTime)
    nodes.eqHigh.gain.setTargetAtTime(eqHigh, currentTime, smoothingTime)
  }
}

/**
 * Disconnect and clean up a track processor
 */
export function disposeTrackProcessor(nodes: TrackProcessorNodes): void {
  nodes.input.disconnect()
  nodes.eqLow.disconnect()
  nodes.eqMid.disconnect()
  nodes.eqHigh.disconnect()
  nodes.volume.disconnect()
  nodes.pan.disconnect()
  nodes.output.disconnect()
}

/**
 * Get the current value of a parameter from a track processor
 */
export function getProcessorValue(
  nodes: TrackProcessorNodes,
  parameter: AutomationParameter
): number {
  switch (parameter) {
    case 'volume':
      return nodes.volume.gain.value
    case 'pan':
      return nodes.pan.pan.value
    case 'eqLow':
      return nodes.eqLow.gain.value
    case 'eqMid':
      return nodes.eqMid.gain.value
    case 'eqHigh':
      return nodes.eqHigh.gain.value
    default:
      return 0
  }
}
