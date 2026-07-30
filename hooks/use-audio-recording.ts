"use client"

import { useState, useRef, useCallback } from "react"
import { saveSessionAudio } from "@/lib/audio-storage"

// Safari/iOS nie zna audio/webm — konstruktor MediaRecorder rzuca NotSupportedError.
// Pierwszy typ obsługiwany przez przeglądarkę wygrywa; "" oznacza domyślny typ silnika.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  return PREFERRED_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ""
}

export function useAudioRecording() {
  const [isRecordingAudio, setIsRecordingAudio] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioURL, setAudioURL] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startAudioRecording = useCallback(async (stream: MediaStream) => {
    try {
      const mimeType = pickMimeType()
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        // Typ bierzemy z samego recordera, nie z życzenia — po fallbacku
        // na domyślny konstruktor może być inny niż wybrany wyżej.
        const type = mediaRecorder.mimeType || mimeType || "audio/webm"
        const blob = new Blob(audioChunksRef.current, { type })
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
