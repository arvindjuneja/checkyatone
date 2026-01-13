"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
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

  return (
    <AudioRecorderContext.Provider value={audioRecorder}>
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
