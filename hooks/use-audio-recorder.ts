"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { type PitchData, detectPitch, frequencyToNote } from "@/lib/pitch-detector"
import { trackEvent } from "@/lib/analytics"

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [currentPitch, setCurrentPitch] = useState<PitchData | null>(null)
  const [pitchHistory, setPitchHistory] = useState<PitchData[]>([])
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [gain, setGain] = useState(2.0) // Default gain multiplier
  const [sensitivity, setSensitivity] = useState(0.002) // RMS threshold - slightly higher to reduce harmonics

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const historyRef = useRef<PitchData[]>([])

  const processAudio = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current || isPaused) {
      animationFrameRef.current = requestAnimationFrame(processAudio)
      return
    }

    const analyser = analyserRef.current
    const bufferLength = analyser.fftSize
    const buffer = new Float32Array(bufferLength)
    analyser.getFloatTimeDomainData(buffer)

    const result = detectPitch(buffer, audioContextRef.current.sampleRate, sensitivity)

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
      historyRef.current = [...historyRef.current, pitchData]
      setPitchHistory(historyRef.current)
    } else {
      setCurrentPitch(null)
    }

    // Update duration
    const elapsed = Date.now() - startTimeRef.current
    setRecordingDuration(elapsed)

    animationFrameRef.current = requestAnimationFrame(processAudio)
  }, [isPaused, sensitivity])

  const startRecording = useCallback(async () => {
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
      setIsRecording(true)
      setIsPaused(false)
      setPitchHistory([])
      setRecordingDuration(0)

      animationFrameRef.current = requestAnimationFrame(processAudio)
    } catch (err) {
      console.error("Error starting recording:", err)
      setError("Nie udało się uzyskać dostępu do mikrofonu. Sprawdź uprawnienia.")
    }
  }, [processAudio])

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    setPitchHistory(historyRef.current)
    setIsRecording(false)
    setIsPaused(false)
    setCurrentPitch(null)
  }, [])

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev)
  }, [])

  const reset = useCallback(() => {
    historyRef.current = []
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

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current) {
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
  }
}
