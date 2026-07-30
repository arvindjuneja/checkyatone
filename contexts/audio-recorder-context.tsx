"use client"

import { createContext, useContext, useCallback, useRef, useEffect, type ReactNode } from "react"
import { useAudioRecorder, type DetectionMode } from "@/hooks/use-audio-recorder"
import { useAudioRecording } from "@/hooks/use-audio-recording"
import { useVoiceProfile } from "@/hooks/use-voice-profile"
import { trackEvent } from "@/lib/analytics"
import type { PitchData } from "@/lib/pitch-detector"
import type { VoiceProfile } from "@/lib/pitch-detector-pro"

interface AudioRecorderContextType {
  isRecording: boolean
  isPaused: boolean
  currentPitch: PitchData | null
  pitchHistory: PitchData[]
  recordingDuration: number
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => PitchData[]
  togglePause: () => void
  reset: () => void
  hasRecording: boolean
  gain: number
  sensitivity: number
  updateGain: (gain: number) => void
  updateSensitivity: (sensitivity: number) => void
  // Detection mode
  detectionMode: DetectionMode
  setDetectionMode: (mode: DetectionMode) => void
  voiceProfile: VoiceProfile | null
  // Audio recording
  audioURL: string | null
  audioBlob: Blob | null
  saveAudioToSession: (sessionId: string) => Promise<boolean>
}

const AudioRecorderContext = createContext<AudioRecorderContextType | null>(null)

export function AudioRecorderProvider({ children }: { children: ReactNode }) {
  const audioRecorder = useAudioRecorder()
  const audioRecording = useAudioRecording()
  const { voiceProfile, addPitch } = useVoiceProfile()
  const streamRef = useRef<MediaStream | null>(null)

  // Update voice profile in audio recorder when it changes
  useEffect(() => {
    audioRecorder.updateVoiceProfile(voiceProfile)
  }, [voiceProfile, audioRecorder.updateVoiceProfile])

  // Add detected pitches to voice profile for learning
  useEffect(() => {
    if (audioRecorder.currentPitch && audioRecorder.isRecording) {
      addPitch(audioRecorder.currentPitch.frequency)
    }
  }, [audioRecorder.currentPitch, audioRecorder.isRecording, addPitch])

  // Wrap recording functions with analytics tracking and audio recording
  const startRecording = useCallback(async () => {
    const stream = await audioRecorder.startRecording()

    // Ten sam strumień co analiza: bez drugiego getUserMedia (AGC by włączyło się
    // domyślnie i nagranie rozjechałoby się z tym, co pokazuje detektor).
    if (stream) {
      streamRef.current = stream
      await audioRecording.startAudioRecording(stream)
    }

    trackEvent("recording_started", "Recording")
  }, [audioRecorder, audioRecording])

  const stopRecording = useCallback((): PitchData[] => {
    const duration = Math.floor(audioRecorder.recordingDuration / 1000)

    // Najpierw domknięcie MediaRecordera, dopiero potem zabicie ścieżek —
    // w odwrotnej kolejności ostatni chunk potrafi przepaść.
    audioRecording.stopAudioRecording()
    const fullHistory = audioRecorder.stopRecording()
    streamRef.current = null

    trackEvent("recording_stopped", "Recording", undefined, duration)
    return fullHistory
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
    voiceProfile,
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
