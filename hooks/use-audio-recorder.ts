"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { type PitchData, detectPitch, frequencyToNote } from "@/lib/pitch-detector"
import { detectPitchPro, resetProPitchTracking, type VoiceProfile } from "@/lib/pitch-detector-pro"
import { trackEvent } from "@/lib/analytics"

export type DetectionMode = "basic" | "pro"

// Wizualizacje patrzą najdalej 6 s w przeszłość (PitchVisualizer VISIBLE_DURATION),
// detekcja vibrata 500 ms. 30 s to pięciokrotny zapas.
// Pełna historia i tak żyje w historyRef i idzie do zapisu — w stanie Reacta
// trzymamy tylko okno, żeby koszt klatki nie rósł z długością nagrania.
const LIVE_WINDOW_MS = 30_000

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentPitch, setCurrentPitch] = useState<PitchData | null>(null)
  const [pitchHistory, setPitchHistory] = useState<PitchData[]>([])
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [gain, setGain] = useState(2.0) // Default gain multiplier
  const [sensitivity, setSensitivity] = useState(0.002) // RMS threshold - slightly higher to reduce harmonics
  const [detectionMode, setDetectionModeState] = useState<DetectionMode>("pro") // Default to Pro mode

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const historyRef = useRef<PitchData[]>([])
  const liveWindowRef = useRef<PitchData[]>([])
  const voiceProfileRef = useRef<VoiceProfile | null>(null)

  const processAudio = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current || isPaused) {
      animationFrameRef.current = requestAnimationFrame(processAudio)
      return
    }

    const analyser = analyserRef.current
    const bufferLength = analyser.fftSize
    const buffer = new Float32Array(bufferLength)
    analyser.getFloatTimeDomainData(buffer)

    let result: { frequency: number; confidence: number } | null = null

    if (detectionMode === "pro") {
      // Use Pro mode with multi-hypothesis scoring
      result = detectPitchPro(buffer, audioContextRef.current.sampleRate, {
        rmsThreshold: sensitivity,
        voiceProfile: voiceProfileRef.current,
      })
    } else {
      // Use Basic YIN-based detection
      result = detectPitch(buffer, audioContextRef.current.sampleRate, sensitivity)
    }

    // Expanded frequency range: 65 Hz (C2) to 2100 Hz (C7)
    if (result && result.frequency >= 65 && result.frequency <= 2100) {
      const noteInfo = frequencyToNote(result.frequency)
      const pitchData: PitchData = {
        frequency: result.frequency,
        note: noteInfo.note,
        octave: noteInfo.octave,
        cents: noteInfo.cents,
        confidence: result.confidence,
        timestamp: Date.now(),
      }

      setCurrentPitch(pitchData)

      // push, nie spread: spread kopiował całą historię co klatkę, więc koszt
      // rósł kwadratowo z długością nagrania.
      historyRef.current.push(pitchData)

      const cutoff = pitchData.timestamp - LIVE_WINDOW_MS
      const liveWindow = liveWindowRef.current
      liveWindow.push(pitchData)
      let expired = 0
      while (expired < liveWindow.length && liveWindow[expired].timestamp < cutoff) expired++
      if (expired > 0) liveWindow.splice(0, expired)

      setPitchHistory([...liveWindow])
    } else {
      setCurrentPitch(null)
    }

    // Update duration
    const elapsed = Date.now() - startTimeRef.current
    setRecordingDuration(elapsed)

    animationFrameRef.current = requestAnimationFrame(processAudio)
  }, [isPaused, sensitivity, detectionMode])

  const startRecording = useCallback(async (): Promise<MediaStream | null> => {
    try {
      setError(null)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      if (audioContext.state === "suspended") {
        await audioContext.resume()
      }

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0
      analyserRef.current = analyser

      // Create gain node for adjustable microphone gain
      const gainNode = audioContext.createGain()
      gainNode.gain.value = gain
      gainNodeRef.current = gainNode

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(gainNode)
      gainNode.connect(analyser)
      sourceRef.current = source

      startTimeRef.current = Date.now()
      historyRef.current = []
      liveWindowRef.current = []
      setIsRecording(true)
      setIsPaused(false)
      setPitchHistory([])
      setRecordingDuration(0)

      animationFrameRef.current = requestAnimationFrame(processAudio)

      // Zwracamy strumień, żeby wołający mógł podpiąć MediaRecorder do TEGO SAMEGO
      // wejścia. Czytanie `isRecording` zaraz po tym wywołaniu nie zadziała —
      // to stale closure i zawsze jest false.
      return stream
    } catch (err) {
      console.error("Error starting recording:", err)
      setError("Nie udało się uzyskać dostępu do mikrofonu. Sprawdź uprawnienia.")
      return null
    }
  }, [processAudio])

  // Zwraca pełną historię, bo stan Reacta w trakcie nagrywania trzyma tylko
  // okno LIVE_WINDOW_MS — wołający nie ma innego dostępu do całości.
  const stopRecording = useCallback((): PitchData[] => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Po stopie stan dostaje PEŁNĄ historię — na tym stoi zapis sesji.
    setPitchHistory(historyRef.current)
    setIsRecording(false)
    setIsPaused(false)
    setCurrentPitch(null)

    return historyRef.current
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev)
  }, [])

  const reset = useCallback(() => {
    historyRef.current = []
    liveWindowRef.current = []
    setPitchHistory([])
    setRecordingDuration(0)
    setCurrentPitch(null)
  }, [])

  const updateGain = useCallback((newGain: number) => {
    setGain(newGain)
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newGain
    }
    // Track gain adjustment
    trackEvent("gain_adjusted", "Settings", undefined, Math.round(newGain * 10))
  }, [])

  const updateSensitivity = useCallback((newSensitivity: number) => {
    setSensitivity(newSensitivity)
    // Track sensitivity adjustment
    trackEvent("sensitivity_adjusted", "Settings", undefined, Math.round(newSensitivity * 1000))
  }, [])

  const setDetectionMode = useCallback((mode: DetectionMode) => {
    setDetectionModeState(mode)
    // Reset pitch tracking when switching modes to avoid stale state
    resetProPitchTracking()
    trackEvent("detection_mode_changed", "Settings", mode)
  }, [])

  const updateVoiceProfile = useCallback((profile: VoiceProfile | null) => {
    voiceProfileRef.current = profile
  }, [])

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }
    }
  }, [])

  return {
    isRecording,
    isPaused,
    currentPitch,
    pitchHistory,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    togglePause,
    reset,
    hasRecording: pitchHistory.length > 0,
    gain,
    sensitivity,
    updateGain,
    updateSensitivity,
    detectionMode,
    setDetectionMode,
    updateVoiceProfile,
  }
}
