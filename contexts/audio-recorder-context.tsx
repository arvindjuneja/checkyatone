"use client"

import { createContext, useContext, useCallback, type ReactNode } from "react"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { trackEvent } from "@/lib/analytics"
import type { PitchData } from "@/lib/pitch-detector"

interface AudioRecorderContextType {
  isRecording: boolean
  isPaused: boolean
  currentPitch: PitchData | null
  pitchHistory: PitchData[]
  recordingDuration: number
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => void
  togglePause: () => void
  reset: () => void
  hasRecording: boolean
  gain: number
  sensitivity: number
  updateGain: (gain: number) => void
  updateSensitivity: (sensitivity: number) => void
}

const AudioRecorderContext = createContext<AudioRecorderContextType | null>(null)

export function AudioRecorderProvider({ children }: { children: ReactNode }) {
  const audioRecorder = useAudioRecorder()

  // Wrap recording functions with analytics tracking
  const startRecording = useCallback(async () => {
    await audioRecorder.startRecording()
    trackEvent("recording_started", "Recording")
  }, [audioRecorder])

  const stopRecording = useCallback(() => {
    const duration = Math.floor(audioRecorder.recordingDuration / 1000)
    audioRecorder.stopRecording()
    trackEvent("recording_stopped", "Recording", undefined, duration)
  }, [audioRecorder])

  const togglePause = useCallback(() => {
    audioRecorder.togglePause()
    trackEvent(audioRecorder.isPaused ? "recording_resumed" : "recording_paused", "Recording")
  }, [audioRecorder])

  const reset = useCallback(() => {
    audioRecorder.reset()
    trackEvent("recording_reset", "Recording")
  }, [audioRecorder])

  const value = {
    ...audioRecorder,
    startRecording,
    stopRecording,
    togglePause,
    reset,
  }

  return (
    <AudioRecorderContext.Provider value={value}>
      {children}
    </AudioRecorderContext.Provider>
  )
}

export function useAudioRecorderContext() {
  const context = useContext(AudioRecorderContext)
  if (!context) {
    throw new Error("useAudioRecorderContext must be used within AudioRecorderProvider")
  }
  return context
}
