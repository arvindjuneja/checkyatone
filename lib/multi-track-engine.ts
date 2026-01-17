// Multi-track audio playback and mixing engine using Web Audio API

import type { Track, AudioClip, AudioSource, AutomationLane } from "./multi-track-storage"
import {
  createTrackProcessor,
  applyProcessingSettings,
  applyAutomationAtTime,
  disposeTrackProcessor,
  type TrackProcessorNodes,
} from "./track-processor"

export class MultiTrackEngine {
  private audioContext: AudioContext | null = null
  private trackSources: Map<string, AudioBufferSourceNode> = new Map()
  private trackGains: Map<string, GainNode> = new Map()
  private trackPanners: Map<string, StereoPannerNode> = new Map()
  private trackProcessors: Map<string, TrackProcessorNodes> = new Map()
  private trackBuffers: Map<string, AudioBuffer> = new Map()
  private masterGain: GainNode | null = null
  private startTime: number = 0
  private pausedAt: number = 0
  private isPlaying: boolean = false
  private isPaused: boolean = false

  // Automation state
  private automationLanes: Map<string, AutomationLane[]> = new Map()
  private tracksData: Map<string, Track> = new Map()
  private automationFrameId: number | null = null

  constructor() {
    if (typeof window !== "undefined") {
      this.audioContext = new AudioContext()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.connect(this.audioContext.destination)
    }
  }

  // Set automation lanes for real-time automation
  setAutomationLanes(lanes: Map<string, AutomationLane[]>): void {
    this.automationLanes = lanes
  }

  // Set tracks data for automation processing
  setTracksData(tracks: Track[]): void {
    this.tracksData = new Map(tracks.map(t => [t.id, t]))
  }

  // Load a track's audio into memory
  async loadTrack(track: Track): Promise<void> {
    if (!this.audioContext) throw new Error("AudioContext not initialized")

    try {
      const arrayBuffer = await track.audioBlob.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      this.trackBuffers.set(track.id, audioBuffer)

      // Create track processor (includes EQ, volume, pan)
      const processor = createTrackProcessor(this.audioContext)
      processor.output.connect(this.masterGain!)
      this.trackProcessors.set(track.id, processor)

      // Apply initial processing settings
      applyProcessingSettings(
        processor,
        track.processing,
        track.volume,
        track.pan,
        track.mute
      )

      // Legacy compatibility - keep gain/pan references
      this.trackGains.set(track.id, processor.volume)
      this.trackPanners.set(track.id, processor.pan)

      console.log(`[MultiTrack] Loaded track: ${track.name} (${audioBuffer.duration.toFixed(2)}s)`)
    } catch (error) {
      console.error(`[MultiTrack] Failed to load track ${track.name}:`, error)
      throw error
    }
  }

  // Load all tracks
  async loadTracks(tracks: Track[]): Promise<void> {
    // Dispose existing processors
    for (const processor of this.trackProcessors.values()) {
      disposeTrackProcessor(processor)
    }

    // Clear existing data
    this.trackBuffers.clear()
    this.trackGains.clear()
    this.trackPanners.clear()
    this.trackProcessors.clear()

    // Load all tracks
    for (const track of tracks) {
      await this.loadTrack(track)
    }

    // Store tracks data for automation
    this.setTracksData(tracks)
  }

  // Update track volume
  setTrackVolume(trackId: string, volume: number, isMuted: boolean): void {
    const gainNode = this.trackGains.get(trackId)
    if (gainNode) {
      gainNode.gain.value = isMuted ? 0 : volume
    }
  }

  // Update track pan
  setTrackPan(trackId: string, pan: number): void {
    const pannerNode = this.trackPanners.get(trackId)
    if (pannerNode) {
      pannerNode.pan.value = pan
    }
  }

  // Set master volume
  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = volume
    }
  }

  // Play all tracks in sync
  play(tracks: Track[]): void {
    if (!this.audioContext || !this.masterGain) {
      console.error("[MultiTrack] AudioContext not initialized")
      return
    }

    // Stop any currently playing tracks
    this.stop()

    // Store tracks data for automation
    this.setTracksData(tracks)

    // Determine if any track has solo enabled
    const hasSolo = tracks.some(track => track.solo)

    // Get current time from context
    const now = this.audioContext.currentTime
    const offset = this.isPaused ? this.pausedAt : 0

    // Create and start source nodes for all tracks
    for (const track of tracks) {
      const buffer = this.trackBuffers.get(track.id)
      const processor = this.trackProcessors.get(track.id)

      if (!buffer || !processor) continue

      // Determine if this track should be audible
      const isAudible = !track.mute && (!hasSolo || track.solo)

      // Create source node and connect to track processor input
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(processor.input)

      // Apply initial processing settings
      applyProcessingSettings(
        processor,
        track.processing,
        track.volume,
        track.pan,
        !isAudible
      )

      // Start playback
      source.start(now, offset)

      // Store source for stopping later
      this.trackSources.set(track.id, source)

      // Handle track ending
      source.onended = () => {
        if (this.isPlaying) {
          this.trackSources.delete(track.id)
          // If all tracks ended, stop playback
          if (this.trackSources.size === 0) {
            this.stop()
          }
        }
      }
    }

    this.isPlaying = true
    this.isPaused = false
    this.startTime = now - offset

    // Start automation loop
    this.startAutomationLoop()

    console.log(`[MultiTrack] Playing ${tracks.length} tracks from ${offset.toFixed(2)}s`)
  }

  // Start the automation update loop
  private startAutomationLoop(): void {
    if (this.automationFrameId !== null) {
      cancelAnimationFrame(this.automationFrameId)
    }

    console.log('[MultiTrack] Starting automation loop, lanes:', this.automationLanes.size)

    const updateAutomation = () => {
      if (!this.isPlaying || !this.audioContext) return

      const currentTime = this.getCurrentTime()

      // Apply automation for each track
      for (const [trackId, processor] of this.trackProcessors.entries()) {
        const track = this.tracksData.get(trackId)
        const lanes = this.automationLanes.get(trackId) || []

        // Skip if no track data, but still apply automation if lanes exist
        if (!track) continue

        // Determine if track is muted
        const hasSolo = Array.from(this.tracksData.values()).some(t => t.solo)
        const isMuted = track.mute || (hasSolo && !track.solo)

        // Apply automation even if lanes array is empty (will use base values)
        applyAutomationAtTime(
          processor,
          lanes,
          currentTime,
          track.volume,
          track.pan,
          track.processing,
          isMuted,
          this.audioContext
        )
      }

      this.automationFrameId = requestAnimationFrame(updateAutomation)
    }

    this.automationFrameId = requestAnimationFrame(updateAutomation)
  }

  // Stop the automation update loop
  private stopAutomationLoop(): void {
    if (this.automationFrameId !== null) {
      cancelAnimationFrame(this.automationFrameId)
      this.automationFrameId = null
    }
  }

  // Pause playback
  pause(): void {
    if (!this.audioContext || !this.isPlaying) return

    // Stop automation loop
    this.stopAutomationLoop()

    // Calculate how far we've played
    this.pausedAt = this.audioContext.currentTime - this.startTime

    // Stop all sources
    this.trackSources.forEach(source => {
      try {
        source.stop()
      } catch (e) {
        // Source might already be stopped
      }
    })
    this.trackSources.clear()

    this.isPlaying = false
    this.isPaused = true

    console.log(`[MultiTrack] Paused at ${this.pausedAt.toFixed(2)}s`)
  }

  // Stop playback and reset
  stop(): void {
    if (!this.audioContext) return

    // Stop automation loop
    this.stopAutomationLoop()

    // Stop all sources
    this.trackSources.forEach(source => {
      try {
        source.stop()
      } catch (e) {
        // Source might already be stopped
      }
    })
    this.trackSources.clear()

    this.isPlaying = false
    this.isPaused = false
    this.pausedAt = 0
    this.startTime = 0

    console.log("[MultiTrack] Stopped")
  }

  // Get current playback time
  getCurrentTime(): number {
    if (!this.audioContext) return 0

    if (this.isPlaying) {
      return this.audioContext.currentTime - this.startTime
    } else if (this.isPaused) {
      return this.pausedAt
    }

    return 0
  }

  // Get the longest track duration
  getDuration(): number {
    let maxDuration = 0
    this.trackBuffers.forEach(buffer => {
      maxDuration = Math.max(maxDuration, buffer.duration)
    })
    return maxDuration
  }

  // Seek to a specific time
  seek(time: number, tracks: Track[]): void {
    const wasPlaying = this.isPlaying

    // Stop current playback
    this.stop()

    // Set paused position
    this.pausedAt = Math.max(0, Math.min(time, this.getDuration()))
    this.isPaused = true

    // If was playing, resume from new position
    if (wasPlaying) {
      this.play(tracks)
    }
  }

  // Check playback state
  getIsPlaying(): boolean {
    return this.isPlaying
  }

  getIsPaused(): boolean {
    return this.isPaused
  }

  // Clean up resources
  dispose(): void {
    this.stop()

    // Dispose track processors
    for (const processor of this.trackProcessors.values()) {
      disposeTrackProcessor(processor)
    }

    this.trackBuffers.clear()
    this.trackGains.clear()
    this.trackPanners.clear()
    this.trackProcessors.clear()
    this.automationLanes.clear()
    this.tracksData.clear()

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  // Mix all tracks to a single audio buffer (for export)
  async mixToBuffer(tracks: Track[], sampleRate: number = 44100): Promise<AudioBuffer> {
    if (!this.audioContext) throw new Error("AudioContext not initialized")

    // Find the longest track
    const duration = this.getDuration()
    const length = Math.ceil(duration * sampleRate)

    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext(2, length, sampleRate)

    // Create master gain
    const masterGain = offlineContext.createGain()
    masterGain.connect(offlineContext.destination)

    // Determine if any track has solo enabled
    const hasSolo = tracks.some(track => track.solo)

    // Add all tracks to offline context
    for (const track of tracks) {
      const buffer = this.trackBuffers.get(track.id)
      if (!buffer) continue

      // Determine if this track should be audible
      const isAudible = !track.mute && (!hasSolo || track.solo)
      if (!isAudible) continue

      const source = offlineContext.createBufferSource()
      source.buffer = buffer

      const gain = offlineContext.createGain()
      gain.gain.value = track.volume

      const panner = offlineContext.createStereoPanner()
      panner.pan.value = track.pan

      source.connect(panner)
      panner.connect(gain)
      gain.connect(masterGain)

      source.start(0)
    }

    // Render
    const renderedBuffer = await offlineContext.startRendering()
    console.log(`[MultiTrack] Mixed ${tracks.length} tracks to buffer (${duration.toFixed(2)}s)`)

    return renderedBuffer
  }

  // Export mixed audio as WAV blob
  async exportMix(tracks: Track[]): Promise<Blob> {
    const mixedBuffer = await this.mixToBuffer(tracks)
    return this.audioBufferToWavBlob(mixedBuffer)
  }

  // Convert AudioBuffer to WAV Blob
  private audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
    const numberOfChannels = audioBuffer.numberOfChannels
    const sampleRate = audioBuffer.sampleRate
    const format = 1 // PCM
    const bitDepth = 16

    const bytesPerSample = bitDepth / 8
    const blockAlign = numberOfChannels * bytesPerSample

    const data: number[] = []
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = audioBuffer.getChannelData(channel)[i]
        const intSample = Math.max(-1, Math.min(1, sample))
        const int16 = intSample < 0 ? intSample * 0x8000 : intSample * 0x7fff
        data.push(int16)
      }
    }

    const dataLength = data.length * bytesPerSample
    const buffer = new ArrayBuffer(44 + dataLength)
    const view = new DataView(buffer)

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, "RIFF")
    view.setUint32(4, 36 + dataLength, true)
    writeString(8, "WAVE")
    writeString(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, format, true)
    view.setUint16(22, numberOfChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitDepth, true)
    writeString(36, "data")
    view.setUint32(40, dataLength, true)

    // Write audio data
    let offset = 44
    for (const sample of data) {
      view.setInt16(offset, sample, true)
      offset += 2
    }

    return new Blob([buffer], { type: "audio/wav" })
  }

  // Clip-based playback methods

  // Load an audio source into memory
  async loadAudioSource(source: AudioSource): Promise<void> {
    if (!this.audioContext) throw new Error("AudioContext not initialized")

    try {
      const arrayBuffer = await source.audioBlob.arrayBuffer()
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer)
      this.trackBuffers.set(source.id, audioBuffer)

      console.log(`[MultiTrack] Loaded source: ${source.name} (${audioBuffer.duration.toFixed(2)}s)`)
    } catch (error) {
      console.error(`[MultiTrack] Failed to load source ${source.name}:`, error)
      throw error
    }
  }

  // Play clips on tracks
  async playClips(
    tracks: Track[],
    clips: Map<string, AudioClip[]>, // Map of trackId -> clips
    sources: Map<string, AudioSource>, // Map of sourceId -> source
    currentTime: number = 0
  ): Promise<void> {
    if (!this.audioContext || !this.masterGain) {
      console.error("[MultiTrack] AudioContext not initialized")
      return
    }

    // Stop any currently playing
    this.stop()

    // Store tracks data for automation
    this.setTracksData(tracks)

    // Load any sources that aren't loaded yet
    for (const source of sources.values()) {
      if (!this.trackBuffers.has(source.id)) {
        await this.loadAudioSource(source)
      }
    }

    // Create track processors for each track if they don't exist
    for (const track of tracks) {
      if (!this.trackProcessors.has(track.id)) {
        const processor = createTrackProcessor(this.audioContext)
        processor.output.connect(this.masterGain)
        this.trackProcessors.set(track.id, processor)

        // Apply initial processing settings
        applyProcessingSettings(
          processor,
          track.processing,
          track.volume,
          track.pan,
          track.mute
        )

        // Legacy compatibility
        this.trackGains.set(track.id, processor.volume)
        this.trackPanners.set(track.id, processor.pan)
      }
    }

    // Determine if any track has solo enabled
    const hasSolo = tracks.some(track => track.solo)

    const now = this.audioContext.currentTime
    const offset = this.isPaused ? this.pausedAt : currentTime

    // Play each clip
    let clipsPlaying = 0
    for (const track of tracks) {
      const trackClips = clips.get(track.id) || []
      const processor = this.trackProcessors.get(track.id)

      if (!processor) continue

      // Determine if this track should be audible
      const isAudible = !track.mute && (!hasSolo || track.solo)

      // Apply processing settings
      applyProcessingSettings(
        processor,
        track.processing,
        track.volume,
        track.pan,
        !isAudible
      )

      for (const clip of trackClips) {
        const source = sources.get(clip.audioSourceId)
        if (!source) continue

        const buffer = this.trackBuffers.get(source.id)
        if (!buffer) continue

        // Calculate when this clip should start playing
        const clipStartInTimeline = clip.startTime
        const clipEndInTimeline = clip.startTime + (clip.duration - clip.trimStart - clip.trimEnd)

        // Skip clips that have already finished
        if (offset > clipEndInTimeline) continue

        // Calculate delay and offset for this clip
        let when = now
        let sourceOffset = clip.trimStart

        if (offset < clipStartInTimeline) {
          // Clip hasn't started yet - schedule it for the future
          when = now + (clipStartInTimeline - offset)
        } else {
          // We're in the middle of this clip
          sourceOffset += (offset - clipStartInTimeline)
        }

        // Create source node and connect to track processor
        const sourceNode = this.audioContext.createBufferSource()
        sourceNode.buffer = buffer
        sourceNode.connect(processor.input)

        // Calculate duration to play
        const duration = (clip.duration - clip.trimStart - clip.trimEnd) - Math.max(0, offset - clipStartInTimeline)

        // Start playback
        sourceNode.start(when, sourceOffset, duration)
        this.trackSources.set(`${clip.id}`, sourceNode)
        clipsPlaying++

        // Handle clip ending
        sourceNode.onended = () => {
          this.trackSources.delete(`${clip.id}`)
          // If all clips ended, stop playback
          if (this.trackSources.size === 0 && this.isPlaying) {
            this.stop()
          }
        }
      }
    }

    if (clipsPlaying > 0) {
      this.isPlaying = true
      this.isPaused = false
      this.startTime = now - offset

      // Start automation loop
      this.startAutomationLoop()

      console.log(`[MultiTrack] Playing ${clipsPlaying} clips from ${offset.toFixed(2)}s`)
    } else {
      console.log("[MultiTrack] No clips to play")
    }
  }
}
