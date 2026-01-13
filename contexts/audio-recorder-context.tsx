"use client"

import { createContext, useContext, useCallback, useRef, type ReactNode } from "react"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { useAudioRecording } from "@/hooks/use-audio-recording"
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
  // Audio recording
  audioURL: string | null
  audioBlob: Blob | null
  saveAudioToSession: (sessionId: string) => Promise<boolean>
}

const AudioRecorderContext = createContext<AudioRecorderContextType | null>(null)

export function AudioRecorderProvider({ children }: { children: ReactNode }) {
  const audioRecorder = useAudioRecorder()
  const audioRecording = useAudioRecording()
  const streamRef = useRef<MediaStream | null>(null)

  // Wrap recording functions with analytics tracking and audio recording
  const startRecording = useCallback(async () => {
    await audioRecorder.startRecording()

    // Start audio recording with the same stream
    if (audioRecorder.isRecording && streamRef.current === null) {
      // Get the stream from the audio recorder's internal state
      // We'll need to wait a tick for the stream to be available
      setTimeout(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          streamRef.current = stream
          await audioRecording.startAudioRecording(stream)
        } catch (error) {
          console.error("Failed to start audio recording:", error)
        }
      }, 100)
    }

    trackEvent("recording_started", "Recording")
  }, [audioRecorder, audioRecording])

  const stopRecording = useCallback(() => {
    const duration = Math.floor(audioRecorder.recordingDuration / 1000)
    audioRecorder.stopRecording()
    audioRecording.stopAudioRecording()

    // Stop all tracks in the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    trackEvent("recording_stopped", "Recording", undefined, duration)
  }, [audioRecorder, audioRecording])

  const togglePause = useCallback(() => {
    audioRecorder.togglePause()
    trackEvent(audioRecorder.isPaused ? "recording_resumed" : "recording_paused", "Recording")
  }, [audioRecorder])

  const reset = useCallback(() => {
    audioRecorder.reset()
    audioRecording.resetAudioRecording()
    trackEvent("recording_reset", "Recording")
  }, [audioRecorder, audioRecording])

  const saveAudioToSession = useCallback(async (sessionId: string) => {
    return await audioRecording.saveAudio(sessionId)
  }, [audioRecording])

  const value = {
    ...audioRecorder,
    startRecording,
    stopRecording,
    togglePause,
    reset,
    audioURL: audioRecording.audioURL,
    audioBlob: audioRecording.audioBlob,
    saveAudioToSession,
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
