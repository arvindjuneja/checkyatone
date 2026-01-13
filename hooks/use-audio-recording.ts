"use client"

import { useState, useRef, useCallback } from "react"
import { saveSessionAudio } from "@/lib/audio-storage"

export function useAudioRecording() {
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioURL, setAudioURL] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startAudioRecording = useCallback(async (stream: MediaStream) => {
    try {
      // Create MediaRecorder to record audio
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        setAudioBlob(blob)
        setAudioURL(URL.createObjectURL(blob))
      }

      mediaRecorder.start(100) // Collect data every 100ms
      mediaRecorderRef.current = mediaRecorder
      setIsRecordingAudio(true)
    } catch (error) {
      console.error("Failed to start audio recording:", error)
    }
  }, [])

  const stopAudioRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
      setIsRecordingAudio(false)
    }
  }, [])

  const resetAudioRecording = useCallback(() => {
    if (audioURL) {
      URL.revokeObjectURL(audioURL)
    }
    setAudioBlob(null)
    setAudioURL(null)
    audioChunksRef.current = []
  }, [audioURL])

  const saveAudio = useCallback(async (sessionId: string) => {
    if (!audioBlob) return false

    try {
      await saveSessionAudio(sessionId, audioBlob)
      return true
    } catch (error) {
      console.error("Failed to save audio:", error)
      return false
    }
  }, [audioBlob])

  return {
    isRecordingAudio,
    audioBlob,
    audioURL,
    startAudioRecording,
    stopAudioRecording,
    resetAudioRecording,
    saveAudio,
  }
}
