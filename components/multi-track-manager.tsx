"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { TrackControls } from "./track-controls"
import { Play, Pause, Square, Download, Plus, Mic, Volume2 } from "lucide-react"
import { MultiTrackEngine } from "@/lib/multi-track-engine"
import {
  type Track,
  type MultiTrackProject,
  multiTrackStorage,
  updateTrack,
  removeTrackFromProject,
  updateProjectMasterVolume,
  addTrackToProject,
} from "@/lib/multi-track-storage"

interface MultiTrackManagerProps {
  project: MultiTrackProject
  onProjectUpdate: () => void
}

export function MultiTrackManager({ project, onProjectUpdate }: MultiTrackManagerProps) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [masterVolume, setMasterVolume] = useState(project.masterVolume)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingWaveform, setRecordingWaveform] = useState<number[]>([])

  const engineRef = useRef<MultiTrackEngine | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const recordingAnimationRef = useRef<number | undefined>(undefined)

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
    setIsLoading(true)
    try {
      const loadedTracks = await multiTrackStorage.getProjectTracks(project.id)
      setTracks(loadedTracks)

      // Load into engine
      if (engineRef.current && loadedTracks.length > 0) {
        await engineRef.current.loadTracks(loadedTracks)
        setDuration(engineRef.current.getDuration())
      }
    } catch (error) {
      console.error("Failed to load tracks:", error)
    } finally {
      setIsLoading(false)
    }
  }

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

  const handlePlay = () => {
    if (!engineRef.current || tracks.length === 0) return

    if (isPlaying) {
      engineRef.current.pause()
      setIsPlaying(false)
    } else {
      engineRef.current.play(tracks)
      setIsPlaying(true)
    }
  }

  const handleStop = () => {
    if (!engineRef.current) return

    engineRef.current.stop()
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const handleUpdateTrack = async (trackId: string, updates: Partial<Track>) => {
    try {
      await updateTrack(trackId, updates)

      // Update local state
      setTracks(prev =>
        prev.map(t => (t.id === trackId ? { ...t, ...updates } : t))
      )

      // Update engine
      if (engineRef.current) {
        if (updates.volume !== undefined || updates.mute !== undefined) {
          const track = tracks.find(t => t.id === trackId)
          if (track) {
            const volume = updates.volume ?? track.volume
            const mute = updates.mute ?? track.mute
            engineRef.current.setTrackVolume(trackId, volume, mute)
          }
        }
        if (updates.pan !== undefined) {
          engineRef.current.setTrackPan(trackId, updates.pan)
        }
      }

      onProjectUpdate()
    } catch (error) {
      console.error("Failed to update track:", error)
    }
  }

  const handleDeleteTrack = async (trackId: string) => {
    try {
      await removeTrackFromProject(trackId)
      await loadTracks() // Reload all tracks
      onProjectUpdate()
    } catch (error) {
      console.error("Failed to delete track:", error)
    }
  }

  const handleMasterVolumeChange = async (volume: number) => {
    setMasterVolume(volume)
    if (engineRef.current) {
      engineRef.current.setMasterVolume(volume)
    }

    try {
      await updateProjectMasterVolume(project.id, volume)
      onProjectUpdate()
    } catch (error) {
      console.error("Failed to update master volume:", error)
    }
  }

  const handleExport = async () => {
    if (!engineRef.current || tracks.length === 0) return

    try {
      const blob = await engineRef.current.exportMix(tracks)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${project.name}-mix-${Date.now()}.wav`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to export mix:", error)
    }
  }

  // Visualize recording waveform
  const visualizeRecording = () => {
    if (!analyserRef.current || !isRecording) return

    const bufferLength = analyserRef.current.fftSize
    const dataArray = new Float32Array(bufferLength)
    analyserRef.current.getFloatTimeDomainData(dataArray)

    // Calculate RMS for this frame
    let sum = 0
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    const rms = Math.sqrt(sum / bufferLength)
    const normalizedValue = Math.min(1, rms * 10) // Normalize to 0-1

    // Add to waveform (keep last 100 samples for visualization)
    setRecordingWaveform(prev => [...prev.slice(-99), normalizedValue])

    recordingAnimationRef.current = requestAnimationFrame(visualizeRecording)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      })

      // Setup audio analysis for waveform visualization
      audioContextRef.current = new AudioContext()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048
      source.connect(analyserRef.current)

      // Start visualization
      setRecordingWaveform([])
      visualizeRecording()

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })

        // Stop visualization
        if (recordingAnimationRef.current) {
          cancelAnimationFrame(recordingAnimationRef.current)
        }
        setRecordingWaveform([])

        // Add as new track
        try {
          await addTrackToProject(project.id, `Track ${tracks.length + 1}`, blob)
          await loadTracks()
          onProjectUpdate()
        } catch (error) {
          console.error("Failed to add recorded track:", error)
        }

        // Stop all tracks and cleanup
        stream.getTracks().forEach(track => track.stop())
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
        analyserRef.current = null
        setIsRecording(false)
      }

      mediaRecorder.start(100)
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
    } catch (error) {
      console.error("Failed to start recording:", error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith("audio/")) return

    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type })
      await addTrackToProject(project.id, file.name, blob)
      await loadTracks()
      onProjectUpdate()
    } catch (error) {
      console.error("Failed to upload track:", error)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const isSoloActive = tracks.some(t => t.solo)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">Loading tracks...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Transport Controls */}
      <div className="bg-card rounded-xl p-4 border border-border">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={handlePlay}
            disabled={tracks.length === 0}
            variant={isPlaying ? "default" : "outline"}
            className="gap-2"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>

          <Button onClick={handleStop} disabled={!isPlaying && currentTime === 0} variant="outline">
            <Square className="w-4 h-4" />
          </Button>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-mono text-muted-foreground mb-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-pitch-perfect transition-all"
                style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
              />
            </div>
          </div>

          <Button onClick={handleExport} disabled={tracks.length === 0} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export Mix
          </Button>
        </div>

        {/* Master Volume */}
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm text-muted-foreground w-20">Master</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={masterVolume}
              onChange={(e) => handleMasterVolumeChange(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer slider"
            />
            <span className="text-sm font-mono w-12 text-right">
              {Math.round(masterVolume * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Recording Waveform Visualization */}
      {isRecording && recordingWaveform.length > 0 && (
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-red-500 flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Recording...
            </h3>
          </div>
          <div className="h-20 bg-secondary/20 rounded-lg flex items-center justify-center gap-px px-2 overflow-hidden">
            {recordingWaveform.map((value, i) => (
              <div
                key={i}
                className="flex-1 bg-pitch-perfect rounded-full transition-all min-w-[2px]"
                style={{ height: `${Math.max(2, value * 100)}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Track List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Tracks ({tracks.length})</h3>
          <div className="flex items-center gap-2">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              variant={isRecording ? "destructive" : "default"}
              size="sm"
              className="gap-2"
            >
              {isRecording ? <Square className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              {isRecording ? "Stop" : "Record"}
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isRecording}
            >
              <Plus className="w-3 h-3" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {tracks.length === 0 ? (
          <div className="bg-secondary/20 rounded-lg p-8 text-center">
            <p className="text-muted-foreground mb-4">No tracks yet</p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={startRecording} className="gap-2">
                <Mic className="w-4 h-4" />
                Record Track
              </Button>
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                Upload Track
              </Button>
            </div>
          </div>
        ) : (
          tracks.map(track => (
            <TrackControls
              key={track.id}
              track={track}
              onUpdateTrack={handleUpdateTrack}
              onDeleteTrack={handleDeleteTrack}
              onPlayTrack={() => {}}
              isPlaying={false}
              isSoloActive={isSoloActive}
            />
          ))
        )}
      </div>
    </div>
  )
}
