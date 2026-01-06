"use client"

import { Button } from "@/components/ui/button"
import { Mic, Square, RotateCcw, Play, Pause } from "lucide-react"

interface RecordingControlsProps {
  isRecording: boolean
  isPaused: boolean
  hasRecording: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onTogglePause: () => void
  onReset: () => void
  recordingDuration: number
}

export function RecordingControls({
  isRecording,
  isPaused,
  hasRecording,
  onStartRecording,
  onStopRecording,
  onTogglePause,
  onReset,
  recordingDuration,
}: RecordingControlsProps) {
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Timer */}
      <div className="text-center">
        <span className="text-5xl font-mono font-bold text-foreground">{formatTime(recordingDuration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {!isRecording && !hasRecording && (
          <Button
            onClick={onStartRecording}
            size="lg"
            className="w-20 h-20 rounded-full bg-pitch-off hover:bg-pitch-off/90 text-foreground"
          >
            <Mic className="w-8 h-8" />
          </Button>
        )}

        {isRecording && (
          <>
            <Button onClick={onTogglePause} size="lg" variant="secondary" className="w-14 h-14 rounded-full">
              {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
            </Button>

            <Button
              onClick={onStopRecording}
              size="lg"
              className="w-20 h-20 rounded-full bg-pitch-off hover:bg-pitch-off/90 text-foreground"
            >
              <Square className="w-8 h-8" />
            </Button>
          </>
        )}

        {!isRecording && hasRecording && (
          <>
            <Button
              onClick={onStartRecording}
              size="lg"
              className="w-20 h-20 rounded-full bg-pitch-off hover:bg-pitch-off/90 text-foreground"
            >
              <Mic className="w-8 h-8" />
            </Button>

            <Button onClick={onReset} size="lg" variant="secondary" className="w-14 h-14 rounded-full">
              <RotateCcw className="w-6 h-6" />
            </Button>
          </>
        )}
      </div>

      {/* Status text */}
      <p className="text-sm text-muted-foreground">
        {isRecording
          ? isPaused
            ? "Wstrzymano"
            : "Nagrywanie..."
          : hasRecording
            ? "Nagranie zakończone"
            : "Dotknij aby nagrać"}
      </p>
    </div>
  )
}
