"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import WaveSurfer from "wavesurfer.js"
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions"
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline"
import { Button } from "@/components/ui/button"
import { Play, Pause, Trash2, Undo, Redo, ZoomIn, ZoomOut, Scissors } from "lucide-react"

interface EditAction {
  type: "delete"
  regions: { start: number; end: number }[]
  timestamp: number
}

interface InteractiveWaveformProps {
  audioBlob: Blob
  onAudioEdited?: (editedBlob: Blob) => void
  color?: string
  height?: number
}

export function InteractiveWaveform({
  audioBlob,
  onAudioEdited,
  color = "#3b82f6",
  height = 128,
}: InteractiveWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<RegionsPlugin | null>(null)
  const isMountedRef = useRef(true)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null)
  const [zoom, setZoom] = useState(1)

  // Edit history for undo/redo
  const [editHistory, setEditHistory] = useState<EditAction[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [deletedRegions, setDeletedRegions] = useState<{ start: number; end: number }[]>([])

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return

    isMountedRef.current = true

    // Create regions plugin
    const regionsPlugin = RegionsPlugin.create()
    regionsPluginRef.current = regionsPlugin

    // Create timeline plugin
    const timelinePlugin = TimelinePlugin.create({
      height: 20,
      insertPosition: "beforebegin",
      timeInterval: 0.5,
      primaryLabelInterval: 5,
      secondaryLabelInterval: 1,
      style: {
        fontSize: "10px",
        color: "#6b7280",
      },
    })

    // Initialize WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: color,
      progressColor: "#1e40af",
      cursorColor: "#ef4444",
      barWidth: 2,
      barRadius: 2,
      cursorWidth: 2,
      height: height,
      barGap: 1,
      plugins: [regionsPlugin, timelinePlugin],
      normalize: true,
      interact: true,
    })

    wavesurferRef.current = wavesurfer

    // Load audio
    const url = URL.createObjectURL(audioBlob)
    wavesurfer.load(url)

    // Event handlers
    wavesurfer.on("ready", () => {
      if (isMountedRef.current) {
        setIsReady(true)
        setDuration(wavesurfer.getDuration())
      }
    })

    wavesurfer.on("play", () => {
      if (isMountedRef.current) setIsPlaying(true)
    })

    wavesurfer.on("pause", () => {
      if (isMountedRef.current) setIsPlaying(false)
    })

    wavesurfer.on("timeupdate", (time) => {
      if (isMountedRef.current) setCurrentTime(time)
    })

    wavesurfer.on("finish", () => {
      if (isMountedRef.current) setIsPlaying(false)
    })

    // Region selection handlers
    regionsPlugin.on("region-clicked", (region, e) => {
      e.stopPropagation()
      if (isMountedRef.current) {
        setSelectedRegion(region)
        // Highlight selected region
        region.setOptions({ color: "rgba(239, 68, 68, 0.3)" })
      }
    })

    regionsPlugin.on("region-created", (region) => {
      // Auto-select newly created regions
      if (isMountedRef.current) {
        setSelectedRegion(region)
      }
    })

    regionsPlugin.enableDragSelection({
      color: "rgba(59, 130, 246, 0.2)",
    })

    // Cleanup
    return () => {
      isMountedRef.current = false

      // Safely destroy wavesurfer - handle async destruction
      if (wavesurfer) {
        // Unsubscribe from all events first
        try {
          wavesurfer.unAll()
        } catch (e) {
          // Ignore
        }

        // Use async cleanup to properly catch promise rejections
        ;(async () => {
          try {
            await wavesurfer.destroy()
          } catch (error) {
            // Silently ignore all errors including AbortError
          }
        })()
      }

      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        // Ignore URL revocation errors
      }
    }
  }, [audioBlob, color, height])

  // Update zoom
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.zoom(zoom)
    }
  }, [zoom, isReady])

  const togglePlayPause = useCallback(() => {
    if (!wavesurferRef.current) return
    wavesurferRef.current.playPause()
  }, [])

  const deleteSelectedRegion = useCallback(async () => {
    if (!selectedRegion || !wavesurferRef.current) return

    const regionData = {
      start: selectedRegion.start,
      end: selectedRegion.end,
    }

    // Add to deleted regions list
    const newDeletedRegions = [...deletedRegions, regionData].sort((a, b) => a.start - b.start)
    setDeletedRegions(newDeletedRegions)

    // Add to history
    const action: EditAction = {
      type: "delete",
      regions: [regionData],
      timestamp: Date.now(),
    }

    const newHistory = editHistory.slice(0, historyIndex + 1)
    newHistory.push(action)
    setEditHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)

    // Remove region visually
    selectedRegion.remove()
    setSelectedRegion(null)

    // Apply edits to audio
    await applyEditsToAudio(newDeletedRegions)
  }, [selectedRegion, deletedRegions, editHistory, historyIndex])

  const applyEditsToAudio = useCallback(async (regions: { start: number; end: number }[]) => {
    if (!wavesurferRef.current || !onAudioEdited) return

    const audioBuffer = wavesurferRef.current.getDecodedData()
    if (!audioBuffer) return

    // Calculate total duration after deletions
    let totalDeletedDuration = 0
    for (const region of regions) {
      totalDeletedDuration += region.end - region.start
    }

    const newDuration = audioBuffer.duration - totalDeletedDuration
    const sampleRate = audioBuffer.sampleRate
    const numberOfChannels = audioBuffer.numberOfChannels
    const newLength = Math.floor(newDuration * sampleRate)

    // Create new audio buffer
    const audioContext = new AudioContext()
    const newBuffer = audioContext.createBuffer(numberOfChannels, newLength, sampleRate)

    // Copy audio data, skipping deleted regions
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const oldData = audioBuffer.getChannelData(channel)
      const newData = newBuffer.getChannelData(channel)

      let writeIndex = 0
      let readIndex = 0

      // Sort regions by start time
      const sortedRegions = [...regions].sort((a, b) => a.start - b.start)

      for (const region of sortedRegions) {
        const regionStartSample = Math.floor(region.start * sampleRate)
        const regionEndSample = Math.floor(region.end * sampleRate)

        // Copy audio before this deleted region
        const samplesToCopy = regionStartSample - readIndex
        if (samplesToCopy > 0) {
          for (let i = 0; i < samplesToCopy; i++) {
            newData[writeIndex++] = oldData[readIndex++]
          }
        }

        // Skip the deleted region
        readIndex = regionEndSample
      }

      // Copy remaining audio after last deleted region
      while (readIndex < oldData.length && writeIndex < newData.length) {
        newData[writeIndex++] = oldData[readIndex++]
      }
    }

    // Convert AudioBuffer to WAV Blob
    const wavBlob = await audioBufferToWavBlob(newBuffer)
    onAudioEdited(wavBlob)

  }, [onAudioEdited])

  const audioBufferToWavBlob = useCallback(async (audioBuffer: AudioBuffer): Promise<Blob> => {
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
  }, [])

  const undo = useCallback(async () => {
    if (historyIndex < 0) return

    const action = editHistory[historyIndex]
    if (action.type === "delete") {
      // Remove the deleted regions from our list
      const newDeletedRegions = deletedRegions.filter(
        (r) => !action.regions.some((ar) => ar.start === r.start && ar.end === r.end)
      )
      setDeletedRegions(newDeletedRegions)
      await applyEditsToAudio(newDeletedRegions)
    }

    setHistoryIndex(historyIndex - 1)
  }, [historyIndex, editHistory, deletedRegions, applyEditsToAudio])

  const redo = useCallback(async () => {
    if (historyIndex >= editHistory.length - 1) return

    const action = editHistory[historyIndex + 1]
    if (action.type === "delete") {
      const newDeletedRegions = [...deletedRegions, ...action.regions].sort((a, b) => a.start - b.start)
      setDeletedRegions(newDeletedRegions)
      await applyEditsToAudio(newDeletedRegions)
    }

    setHistoryIndex(historyIndex + 1)
  }, [historyIndex, editHistory, deletedRegions, applyEditsToAudio])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          onClick={togglePlayPause}
          disabled={!isReady}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isPlaying ? "Pause" : "Play"}
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button
          onClick={deleteSelectedRegion}
          disabled={!selectedRegion}
          variant="outline"
          size="sm"
          className="gap-2"
          title="Delete selected region (or drag to select)"
        >
          <Scissors className="w-3 h-3" />
          Cut Selection
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button
          onClick={undo}
          disabled={historyIndex < 0}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Undo className="w-3 h-3" />
        </Button>

        <Button
          onClick={redo}
          disabled={historyIndex >= editHistory.length - 1}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Redo className="w-3 h-3" />
        </Button>

        <div className="h-6 w-px bg-border" />

        <Button
          onClick={() => setZoom(Math.max(1, zoom - 10))}
          disabled={zoom <= 1}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <ZoomOut className="w-3 h-3" />
        </Button>

        <Button
          onClick={() => setZoom(Math.min(100, zoom + 10))}
          disabled={zoom >= 100}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <ZoomIn className="w-3 h-3" />
        </Button>

        <div className="ml-auto text-xs text-muted-foreground font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Hint */}
      {isReady && deletedRegions.length === 0 && (
        <div className="text-xs text-muted-foreground bg-secondary/20 rounded p-2">
          💡 Click and drag on the waveform to select a region, then click "Cut Selection" to remove it
        </div>
      )}

      {/* Edit info */}
      {deletedRegions.length > 0 && (
        <div className="text-xs text-pitch-perfect bg-pitch-perfect/10 rounded p-2">
          ✂️ {deletedRegions.length} region{deletedRegions.length > 1 ? "s" : ""} removed
        </div>
      )}

      {/* Waveform Container */}
      <div className="bg-secondary/20 rounded-lg overflow-hidden">
        <div ref={containerRef} className="w-full" />
      </div>

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="text-sm text-muted-foreground">Loading waveform...</div>
        </div>
      )}
    </div>
  )
}
