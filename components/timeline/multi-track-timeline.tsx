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
  type AutomationLane,
  multiTrackStorage,
  updateTimelineState,
  updateClip,
  createAudioSource,
  createClip,
  generateWaveformData,
  createTrack,
  createAutomationLaneForTrack,
  addAutomationPoint,
  updateAutomationPoint,
  deleteAutomationPoint,
  updateAutomationLane,
  removeTrackFromProject,
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
  const [automationLanes, setAutomationLanes] = useState<Map<string, AutomationLane[]>>(new Map())
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([])

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [viewportWidth, setViewportWidth] = useState(800)
  const engineRef = useRef<MultiTrackEngine | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRestoredForProjectRef = useRef<string | null>(null)
  const automationSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize engine
  useEffect(() => {
    engineRef.current = new MultiTrackEngine()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (automationSaveTimeoutRef.current) {
        clearTimeout(automationSaveTimeoutRef.current)
      }
      engineRef.current?.dispose()
    }
  }, [])

  // Load tracks
  useEffect(() => {
    loadTracks()
  }, [project.id])

  // Keep engine's automation lanes in sync with state
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setAutomationLanes(automationLanes)
    }
  }, [automationLanes])

  // Keep engine's tracks data in sync
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setTracksData(tracks)
    }
  }, [tracks])

  const loadTracks = async () => {
    const loadedTracks = await multiTrackStorage.getProjectTracks(project.id)
    setTracks(loadedTracks)

    // Load all clips, sources, and automation lanes
    const clipsMap = new Map()
    const sourcesMap = new Map()
    const lanesMap = new Map()
    let maxDuration = 60 // Default minimum

    for (const track of loadedTracks) {
      const trackClips = await multiTrackStorage.getTrackClips(track.id)
      clipsMap.set(track.id, trackClips)

      // Load automation lanes for this track
      const trackLanes = await multiTrackStorage.getTrackAutomationLanes(track.id)
      lanesMap.set(track.id, trackLanes)

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
    setAutomationLanes(lanesMap)
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

  // Restore scroll position after tracks are loaded (only once per project)
  useEffect(() => {
    // Only restore once per project, and only after tracks are loaded
    if (
      viewportRef.current &&
      tracks.length > 0 &&
      scrollRestoredForProjectRef.current !== project.id
    ) {
      scrollRestoredForProjectRef.current = project.id
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (viewportRef.current) {
          viewportRef.current.scrollLeft = timelineState.scrollX
          viewportRef.current.scrollTop = timelineState.scrollY
        }
      })
    }
  }, [tracks.length, project.id, timelineState.scrollX, timelineState.scrollY])

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
      // Set automation lanes before playing
      engineRef.current.setAutomationLanes(automationLanes)
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

  // Automation lane handlers
  const handleSelectPoint = (pointId: string, addToSelection: boolean) => {
    if (addToSelection) {
      setSelectedPointIds(prev =>
        prev.includes(pointId)
          ? prev.filter(id => id !== pointId)
          : [...prev, pointId]
      )
    } else {
      setSelectedPointIds([pointId])
    }
  }

  const handleAddAutomationPoint = async (laneId: string, time: number, value: number) => {
    try {
      await addAutomationPoint(laneId, time, value, 'smooth')
      // Update local state
      await loadTracks()
    } catch (error) {
      console.error("Failed to add automation point:", error)
    }
  }

  const handleMoveAutomationPoint = (
    laneId: string,
    pointId: string,
    time: number,
    value: number
  ) => {
    // Update local state FIRST for smooth UI during drag
    setAutomationLanes(prevLanes => {
      const newLanes = new Map(prevLanes)
      for (const [trackId, lanes] of newLanes.entries()) {
        const updatedLanes = lanes.map(lane => {
          if (lane.id !== laneId) return lane
          return {
            ...lane,
            points: lane.points.map(point =>
              point.id === pointId
                ? { ...point, time, value: Math.max(0, Math.min(1, value)) }
                : point
            ).sort((a, b) => a.time - b.time),
          }
        })
        newLanes.set(trackId, updatedLanes)
      }
      return newLanes
    })

    // Debounce database save - only save 100ms after last move
    if (automationSaveTimeoutRef.current) {
      clearTimeout(automationSaveTimeoutRef.current)
    }
    automationSaveTimeoutRef.current = setTimeout(() => {
      updateAutomationPoint(laneId, pointId, { time, value }).catch(error => {
        console.error("Failed to save automation point move:", error)
      })
    }, 100)
  }

  const handleDeleteAutomationPoint = async (laneId: string, pointId: string) => {
    try {
      await deleteAutomationPoint(laneId, pointId)
      setSelectedPointIds(prev => prev.filter(id => id !== pointId))
      await loadTracks()
    } catch (error) {
      console.error("Failed to delete automation point:", error)
    }
  }

  const handleAutomationCurveChange = async (
    laneId: string,
    pointId: string,
    curve: 'linear' | 'smooth'
  ) => {
    try {
      await updateAutomationPoint(laneId, pointId, { curve })
      await loadTracks()
    } catch (error) {
      console.error("Failed to update automation curve:", error)
    }
  }

  const handleCreateAutomationLane = async (
    trackId: string,
    parameter: import('@/lib/automation').AutomationParameter
  ) => {
    try {
      await createAutomationLaneForTrack(trackId, parameter, true)
      await loadTracks()
    } catch (error) {
      console.error("Failed to create automation lane:", error)
    }
  }

  const handleToggleAutomationLane = async (laneId: string, visible: boolean) => {
    try {
      await updateAutomationLane(laneId, { visible })
      await loadTracks()
    } catch (error) {
      console.error("Failed to toggle automation lane:", error)
    }
  }

  const handleUpdateTrack = async (trackId: string, updates: Partial<import('@/lib/multi-track-storage').Track>) => {
    try {
      const { updateTrack } = await import('@/lib/multi-track-storage')
      await updateTrack(trackId, updates)

      // Update local state immediately
      setTracks(prevTracks =>
        prevTracks.map(track =>
          track.id === trackId ? { ...track, ...updates } : track
        )
      )

      // Also update the engine in real-time for volume/mute changes
      if (engineRef.current) {
        const track = tracks.find(t => t.id === trackId)
        if (track) {
          if ('volume' in updates || 'mute' in updates) {
            const newVolume = updates.volume ?? track.volume
            const newMute = updates.mute ?? track.mute
            engineRef.current.setTrackVolume(trackId, newVolume, newMute)
          }
          if ('pan' in updates) {
            engineRef.current.setTrackPan(trackId, updates.pan ?? track.pan)
          }
        }
      }
    } catch (error) {
      console.error("Failed to update track:", error)
    }
  }

  const handleDeleteTrack = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId)
    const trackName = track?.name || 'this track'

    if (!confirm(`Are you sure you want to delete "${trackName}"? This will also delete all clips and automation data on this track.`)) {
      return
    }

    try {
      // Stop playback if playing
      if (isPlaying) {
        handleStop()
      }

      await removeTrackFromProject(trackId)
      await loadTracks()
      onProjectUpdate()
    } catch (error) {
      console.error("Failed to delete track:", error)
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
                  automationLanes={automationLanes.get(track.id) || []}
                  selectedPointIds={selectedPointIds}
                  isSoloActive={tracks.some(t => t.solo)}
                  onSelectClip={handleSelectClip}
                  onUpdateClipPosition={handleUpdateClipPosition}
                  onUpdateClipTrim={handleUpdateClipTrim}
                  onSelectPoint={handleSelectPoint}
                  onAddAutomationPoint={handleAddAutomationPoint}
                  onMoveAutomationPoint={handleMoveAutomationPoint}
                  onDeleteAutomationPoint={handleDeleteAutomationPoint}
                  onAutomationCurveChange={handleAutomationCurveChange}
                  onCreateAutomationLane={handleCreateAutomationLane}
                  onToggleAutomationLane={handleToggleAutomationLane}
                  onUpdateTrack={handleUpdateTrack}
                  onDeleteTrack={handleDeleteTrack}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
