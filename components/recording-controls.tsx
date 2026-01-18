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
    <div className="flex flex-col items-center gap-6">
      {/* Timer - Friendly display with tabular-nums */}
      <div className="text-center">
        <span className="text-4xl font-semibold tabular-nums text-foreground tracking-tight">
          {formatTime(recordingDuration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-5">
        {!isRecording && !hasRecording && (
          <button
            onClick={onStartRecording}
            className="w-20 h-20 rounded-full bg-gradient-to-b from-primary to-primary/80
                       shadow-[0_8px_32px_-8px] shadow-primary/50
                       hover:shadow-[0_12px_40px_-8px] hover:shadow-primary/60
                       hover:translate-y-[-2px]
                       active:scale-95 active:translate-y-0
                       transition-all duration-200
                       flex items-center justify-center text-primary-foreground"
          >
            <Mic className="w-8 h-8" />
          </button>
        )}

        {isRecording && (
          <>
            <Button
              onClick={onTogglePause}
              size="icon-lg"
              variant="secondary"
              className="w-14 h-14 rounded-full shadow-lg"
            >
              {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
            </Button>

            <button
              onClick={onStopRecording}
              className="w-20 h-20 rounded-full bg-gradient-to-b from-destructive to-destructive/80
                         shadow-[0_8px_32px_-8px] shadow-destructive/50
                         hover:shadow-[0_12px_40px_-8px] hover:shadow-destructive/60
                         hover:translate-y-[-2px]
                         active:scale-95 active:translate-y-0
                         transition-all duration-200
                         flex items-center justify-center text-destructive-foreground
                         breathing-pulse"
            >
              <Square className="w-8 h-8" />
            </button>
          </>
        )}

        {!isRecording && hasRecording && (
          <>
            <button
              onClick={onStartRecording}
              className="w-20 h-20 rounded-full bg-gradient-to-b from-primary to-primary/80
                         shadow-[0_8px_32px_-8px] shadow-primary/50
                         hover:shadow-[0_12px_40px_-8px] hover:shadow-primary/60
                         hover:translate-y-[-2px]
                         active:scale-95 active:translate-y-0
                         transition-all duration-200
                         flex items-center justify-center text-primary-foreground"
            >
              <Mic className="w-8 h-8" />
            </button>

            <Button
              onClick={onReset}
              size="icon-lg"
              variant="secondary"
              className="w-14 h-14 rounded-full shadow-lg"
            >
              <RotateCcw className="w-6 h-6" />
            </Button>
          </>
        )}
      </div>

      {/* Status text - Friendly */}
      <p className="text-sm text-muted-foreground font-medium">
        {isRecording
          ? isPaused
            ? "Wstrzymano"
            : "Nagrywanie..."
          : hasRecording
            ? "Nagranie zakonczone"
            : "Dotknij aby nagrywac"}
      </p>
    </div>
  )
}
