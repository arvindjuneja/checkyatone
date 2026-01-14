"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Play, Pause, Square, Download, Plus, ZoomIn, ZoomOut, Upload } from "lucide-react"
import { TimeRuler } from "./time-ruler"
import { Playhead } from "./playhead"
import { TrackLane } from "./track-lane"
import { MultiTrackEngine } from "@/lib/multi-track-engine"
import {
  type MultiTrackProject,
  type Track,
  type TimelineState,
  multiTrackStorage,
  updateTimelineState,
  updateClip,
  createAudioSource,
  createClip,
  generateWaveformData,
  createTrack,
} from "@/lib/multi-track-storage"

interface MultiTrackTimelineProps {
  project: MultiTrackProject
  onProjectUpdate: () => void
}

export function MultiTrackTimeline({ project, onProjectUpdate }: MultiTrackTimelineProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [timelineState, setTimelineState] = useState<TimelineState>(
    project.timelineState || {
      pixelsPerSecond: 100,
      scrollX: 0,
      scrollY: 0,
      snapEnabled: true,
      snapInterval: 1,
      selectedClipIds: [],
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0,
    }
  )

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(60) // Default 60 seconds
  const [clips, setClips] = useState<Map<string, import("@/lib/multi-track-storage").AudioClip[]>>(new Map())
  const [sources, setSources] = useState<Map<string, import("@/lib/multi-track-storage").AudioSource>>(new Map())

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [viewportWidth, setViewportWidth] = useState(800)
  const engineRef = useRef<MultiTrackEngine | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Initialize engine
  useEffect(() => {
    engineRef.current = new MultiTrackEngine()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      engineRef.current?.dispose()
    }
  }, [])

  // Load tracks
  useEffect(() => {
    loadTracks()
  }, [project.id])

  const loadTracks = async () => {
    const loadedTracks = await multiTrackStorage.getProjectTracks(project.id)
    setTracks(loadedTracks)

    // Load all clips and sources
    const clipsMap = new Map()
    const sourcesMap = new Map()
    let maxDuration = 60 // Default minimum

    for (const track of loadedTracks) {
      const trackClips = await multiTrackStorage.getTrackClips(track.id)
      clipsMap.set(track.id, trackClips)

      // Load sources for these clips and calculate duration
      for (const clip of trackClips) {
        if (!sourcesMap.has(clip.audioSourceId)) {
          const source = await multiTrackStorage.getAudioSource(clip.audioSourceId)
          if (source) {
            sourcesMap.set(source.id, source)
          }
        }

        // Calculate max duration from clip end times
        const clipEnd = clip.startTime + (clip.duration - clip.trimStart - clip.trimEnd)
        maxDuration = Math.max(maxDuration, clipEnd)
      }
    }

    setClips(clipsMap)
    setSources(sourcesMap)
    setDuration(Math.ceil(maxDuration) + 10) // Add 10 seconds padding
  }

  // Update viewport width
  useEffect(() => {
    const updateSize = () => {
      if (viewportRef.current) {
        setViewportWidth(viewportRef.current.clientWidth)
      }
    }

    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  // Update playback time
  const updateTime = useCallback(() => {
    if (engineRef.current && isPlaying) {
      setCurrentTime(engineRef.current.getCurrentTime())
      animationFrameRef.current = requestAnimationFrame(updateTime)
    }
  }, [isPlaying])

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime)
    } else if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, updateTime])

  const handlePlay = async () => {
    if (!engineRef.current || tracks.length === 0) return

    if (isPlaying) {
      engineRef.current.pause()
      setIsPlaying(false)
    } else {
      await engineRef.current.playClips(tracks, clips, sources, currentTime)
      setIsPlaying(true)
    }
  }

  const handleStop = () => {
    if (!engineRef.current) return

    engineRef.current.stop()
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const handleSeek = async (time: number) => {
    if (!engineRef.current) return

    const wasPlaying = isPlaying
    if (wasPlaying) {
      engineRef.current.stop()
    }

    setCurrentTime(time)

    if (wasPlaying) {
      await engineRef.current.playClips(tracks, clips, sources, time)
    }
  }

  const handleZoomIn = () => {
    const newPixelsPerSecond = Math.min(1000, timelineState.pixelsPerSecond * 1.5)
    updateLocalTimelineState({ pixelsPerSecond: newPixelsPerSecond })
  }

  const handleZoomOut = () => {
    const newPixelsPerSecond = Math.max(10, timelineState.pixelsPerSecond / 1.5)
    updateLocalTimelineState({ pixelsPerSecond: newPixelsPerSecond })
  }

  const updateLocalTimelineState = async (updates: Partial<TimelineState>) => {
    const newState = { ...timelineState, ...updates }
    setTimelineState(newState)
    await updateTimelineState(project.id, updates)
  }

  const handleSelectClip = (clipId: string, addToSelection: boolean) => {
    let newSelection: string[]
    if (addToSelection) {
      if (timelineState.selectedClipIds.includes(clipId)) {
        newSelection = timelineState.selectedClipIds.filter((id) => id !== clipId)
      } else {
        newSelection = [...timelineState.selectedClipIds, clipId]
      }
    } else {
      newSelection = [clipId]
    }

    updateLocalTimelineState({ selectedClipIds: newSelection })
  }

  const handleUpdateClipPosition = async (clipId: string, startTime: number) => {
    // Apply snap if enabled
    const snappedTime = timelineState.snapEnabled
      ? Math.round(startTime / timelineState.snapInterval) * timelineState.snapInterval
      : startTime

    // Update the clip in storage
    await updateClip(clipId, { startTime: snappedTime })

    // Update local state immediately without full reload
    setClips(prevClips => {
      const newClips = new Map(prevClips)
      for (const [trackId, trackClips] of newClips.entries()) {
        const updatedClips = trackClips.map(clip =>
          clip.id === clipId ? { ...clip, startTime: snappedTime } : clip
        )
        newClips.set(trackId, updatedClips)
      }
      return newClips
    })
  }

  const handleUpdateClipTrim = async (clipId: string, trimStart: number, trimEnd: number) => {
    // Update the clip in storage
    await updateClip(clipId, { trimStart, trimEnd })

    // Update local state immediately without full reload
    setClips(prevClips => {
      const newClips = new Map(prevClips)
      for (const [trackId, trackClips] of newClips.entries()) {
        const updatedClips = trackClips.map(clip =>
          clip.id === clipId ? { ...clip, trimStart, trimEnd } : clip
        )
        newClips.set(trackId, updatedClips)
      }
      return newClips
    })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith("audio/")) return

    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type })

      // Generate waveform data
      const waveformData = await generateWaveformData(blob, 1000)

      // Create audio source
      const sourceId = await createAudioSource(project.id, file.name, blob, waveformData)

      // Always create a new track for each audio file
      const trackName = file.name.replace(/\.[^/.]+$/, "") // Remove file extension
      const targetTrackId = await createTrack(project.id, trackName)

      // Create clip at current playhead position
      await createClip(targetTrackId, sourceId, currentTime, file.name)

      await loadTracks()
      onProjectUpdate()
    } catch (error) {
      console.error("Failed to upload audio:", error)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleCreateTrack = async () => {
    try {
      await createTrack(project.id)
      await loadTracks()
      onProjectUpdate()
    } catch (error) {
      console.error("Failed to create track:", error)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Transport Controls */}
      <div className="bg-card rounded-xl p-4 border border-border mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={handlePlay}
            disabled={tracks.length === 0}
            variant={isPlaying ? "default" : "outline"}
            className="gap-2"
            size="sm"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>

          <Button onClick={handleStop} disabled={!isPlaying && currentTime === 0} variant="outline" size="sm">
            <Square className="w-3 h-3" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono text-muted-foreground">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button onClick={handleZoomOut} variant="outline" size="icon-sm" title="Zoom out">
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-xs text-muted-foreground w-16 text-center">
              {timelineState.pixelsPerSecond.toFixed(0)}px/s
            </span>
            <Button onClick={handleZoomIn} variant="outline" size="icon-sm" title="Zoom in">
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>

          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Upload className="w-3 h-3" />
            Add Audio
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <Button
            onClick={handleCreateTrack}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Plus className="w-3 h-3" />
            New Track
          </Button>
        </div>
      </div>

      {/* Timeline Viewport */}
      <div className="flex-1 bg-card rounded-xl border border-border overflow-hidden flex flex-col">
        {/* Time Ruler */}
        <div className="bg-card border-b border-border">
          <TimeRuler
            pixelsPerSecond={timelineState.pixelsPerSecond}
            duration={duration}
            scrollX={timelineState.scrollX}
            viewportWidth={viewportWidth}
            onSeek={handleSeek}
          />
        </div>

        {/* Scrollable track area */}
        <div
          ref={viewportRef}
          className="flex-1 overflow-auto relative"
          onScroll={(e) => {
            const target = e.currentTarget
            updateLocalTimelineState({
              scrollX: target.scrollLeft,
              scrollY: target.scrollTop,
            })
          }}
        >
          <div
            className="relative"
            style={{
              width: duration * timelineState.pixelsPerSecond,
              minHeight: "100%",
            }}
          >
            {/* Playhead */}
            <Playhead
              currentTime={currentTime}
              pixelsPerSecond={timelineState.pixelsPerSecond}
              scrollX={timelineState.scrollX}
              viewportWidth={viewportWidth}
              onSeek={handleSeek}
            />

            {/* Track lanes */}
            {tracks.length === 0 ? (
              <div className="flex items-center justify-center h-full p-12">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">No tracks yet</p>
                  <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Audio
                  </Button>
                </div>
              </div>
            ) : (
              tracks.map((track) => (
                <TrackLane
                  key={track.id}
                  track={track}
                  pixelsPerSecond={timelineState.pixelsPerSecond}
                  duration={duration}
                  scrollX={timelineState.scrollX}
                  selectedClipIds={timelineState.selectedClipIds}
                  clips={clips.get(track.id) || []}
                  sources={sources}
                  onSelectClip={handleSelectClip}
                  onUpdateClipPosition={handleUpdateClipPosition}
                  onUpdateClipTrim={handleUpdateClipTrim}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
