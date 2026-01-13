"use client"

import { useState, useRef, useEffect } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PitchVisualizer } from "@/components/pitch-visualizer"
import { type PitchData } from "@/lib/pitch-detector"

interface AudioPlaybackProps {
  audioURL: string
  pitchHistory: PitchData[]
  sessionDuration: number
}

export function AudioPlayback({ audioURL, pitchHistory, sessionDuration }: AudioPlaybackProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [])

  const handlePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleRestart = () => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = 0
    setCurrentTime(0)
    if (isPlaying) {
      audio.play()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return

    const newTime = parseFloat(e.target.value)
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Calculate which part of pitch history to show based on current playback time
  const getVisiblePitchHistory = () => {
    if (pitchHistory.length === 0 || duration === 0) return []

    // Calculate time range to show (current time ± 5 seconds for context)
    const startTime = Math.max(0, currentTime - 5)
    const endTime = Math.min(duration, currentTime + 5)

    // Convert times to pitch history indices
    const startIndex = Math.floor((startTime / duration) * pitchHistory.length)
    const endIndex = Math.ceil((endTime / duration) * pitchHistory.length)

    return pitchHistory.slice(startIndex, endIndex)
  }

  return (
    <div className="space-y-4">
      <audio ref={audioRef} src={audioURL} preload="metadata" />

      {/* Pitch visualization overlay */}
      <div className="bg-background rounded-lg p-3 border border-border">
        <PitchVisualizer
          pitchHistory={getVisiblePitchHistory()}
          currentPitch={null}
          isRecording={false}
        />
      </div>

      {/* Audio controls */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <div className="flex items-center gap-3">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={handlePlayPause}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <Button
            size="icon-sm"
            variant="outline"
            onClick={handleRestart}
            title="Restart"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-secondary rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3
                [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-pitch-perfect
                [&::-moz-range-thumb]:w-3
                [&::-moz-range-thumb]:h-3
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-pitch-perfect
                [&::-moz-range-thumb]:border-0"
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Odtwarzanie nagrania z wizualizacją wysokości dźwięku
        </p>
      </div>
    </div>
  )
}
