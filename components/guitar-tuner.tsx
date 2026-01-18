"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  TUNINGS,
  type GuitarTuning,
  type GuitarString,
  playGuitarString,
  getCentsDifference,
  getTuningStatus,
} from "@/lib/guitar"
import { Play, Square, Mic, MicOff, Volume2 } from "lucide-react"

interface GuitarTunerProps {
  onClose?: () => void
}

export function GuitarTuner({ onClose }: GuitarTunerProps) {
  const [selectedTuning, setSelectedTuning] = useState<GuitarTuning>(TUNINGS[0])
  const [selectedString, setSelectedString] = useState<GuitarString | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [detectedFrequency, setDetectedFrequency] = useState<number | null>(null)
  const [detectedNote, setDetectedNote] = useState<string | null>(null)
  const [playingString, setPlayingString] = useState<number | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationRef = useRef<number | null>(null)
  const currentToneRef = useRef<{ stop: () => void } | null>(null)

  // Start listening to microphone
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)

      audioContextRef.current = audioContext
      analyserRef.current = analyser
      streamRef.current = stream

      setIsListening(true)
      detectPitch()
    } catch (error) {
      console.error("Failed to access microphone:", error)
    }
  }, [])

  // Stop listening
  const stopListening = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    setIsListening(false)
    setDetectedFrequency(null)
    setDetectedNote(null)
  }, [])

  // Pitch detection using autocorrelation
  const detectPitch = useCallback(() => {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const bufferLength = analyser.fftSize
    const buffer = new Float32Array(bufferLength)

    const detect = () => {
      analyser.getFloatTimeDomainData(buffer)

      // Autocorrelation pitch detection
      const frequency = autoCorrelate(buffer, audioContextRef.current!.sampleRate)

      if (frequency > 0) {
        setDetectedFrequency(frequency)
        setDetectedNote(frequencyToNote(frequency))
      }

      animationRef.current = requestAnimationFrame(detect)
    }

    detect()
  }, [])

  // Autocorrelation algorithm for pitch detection
  const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
    // Find the root mean square to check if there's enough signal
    let rms = 0
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i]
    }
    rms = Math.sqrt(rms / buffer.length)

    if (rms < 0.01) return -1 // Not enough signal

    // Find the first point where the signal crosses zero
    let r1 = 0
    let r2 = buffer.length - 1
    const threshold = 0.2

    for (let i = 0; i < buffer.length / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) {
        r1 = i
        break
      }
    }

    for (let i = 1; i < buffer.length / 2; i++) {
      if (Math.abs(buffer[buffer.length - i]) < threshold) {
        r2 = buffer.length - i
        break
      }
    }

    const buf2 = buffer.slice(r1, r2)
    const c = new Array(buf2.length).fill(0)

    for (let i = 0; i < buf2.length; i++) {
      for (let j = 0; j < buf2.length - i; j++) {
        c[i] += buf2[j] * buf2[j + i]
      }
    }

    let d = 0
    while (c[d] > c[d + 1]) d++

    let maxval = -1
    let maxpos = -1

    for (let i = d; i < buf2.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i]
        maxpos = i
      }
    }

    let T0 = maxpos

    // Parabolic interpolation
    const x1 = c[T0 - 1]
    const x2 = c[T0]
    const x3 = c[T0 + 1]
    const a = (x1 + x3 - 2 * x2) / 2
    const b = (x3 - x1) / 2

    if (a) T0 = T0 - b / (2 * a)

    return sampleRate / T0
  }

  // Convert frequency to note name
  const frequencyToNote = (frequency: number): string => {
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    const A4 = 440
    const semitones = 12 * Math.log2(frequency / A4)
    const noteIndex = Math.round(semitones) + 9 // A is at index 9
    const octave = Math.floor((noteIndex + 3) / 12) + 4
    const noteName = noteNames[((noteIndex % 12) + 12) % 12]
    return `${noteName}${octave}`
  }

  // Play reference tone for a string
  const playString = useCallback((stringIndex: number) => {
    // Stop any currently playing tone
    if (currentToneRef.current) {
      currentToneRef.current.stop()
    }

    const string = selectedTuning.strings[stringIndex]
    setPlayingString(stringIndex)
    setSelectedString(string)

    currentToneRef.current = playGuitarString(string.frequency, 2)

    setTimeout(() => {
      setPlayingString(null)
    }, 2000)
  }, [selectedTuning])

  // Stop playing tone
  const stopTone = useCallback(() => {
    if (currentToneRef.current) {
      currentToneRef.current.stop()
      currentToneRef.current = null
    }
    setPlayingString(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
      stopTone()
    }
  }, [stopListening, stopTone])

  // Get tuning indicator for current string
  const getTuningIndicator = () => {
    if (!selectedString || !detectedFrequency) return null

    const cents = getCentsDifference(detectedFrequency, selectedString.frequency)
    const status = getTuningStatus(detectedFrequency, selectedString.frequency)

    return { cents: Math.round(cents), status }
  }

  const tuningIndicator = getTuningIndicator()

  return (
    <div className="space-y-6">
      {/* Tuning Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Stroj</label>
        <div className="flex flex-wrap gap-2">
          {TUNINGS.map((tuning) => (
            <button
              key={tuning.id}
              onClick={() => setSelectedTuning(tuning)}
              className={`px-3 py-2 text-sm rounded-xl border transition-colors ${
                selectedTuning.id === tuning.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border hover:border-primary/50"
              }`}
            >
              {tuning.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tuning Display */}
      <div className="rounded-2xl bg-card border border-border p-6 space-y-6">
        {/* Pitch Display */}
        <div className="text-center space-y-2">
          <div className="text-6xl font-bold tabular-nums">
            {detectedNote || "--"}
          </div>
          <div className="text-xl text-muted-foreground tabular-nums">
            {detectedFrequency ? `${detectedFrequency.toFixed(1)} Hz` : "-- Hz"}
          </div>

          {/* Tuning Indicator */}
          {tuningIndicator && (
            <div className="space-y-2">
              <div
                className={`text-lg font-semibold ${
                  tuningIndicator.status === "in-tune"
                    ? "text-green-500"
                    : tuningIndicator.status === "flat"
                      ? "text-blue-500"
                      : "text-red-500"
                }`}
              >
                {tuningIndicator.status === "in-tune"
                  ? "In Tune!"
                  : tuningIndicator.status === "flat"
                    ? `${Math.abs(tuningIndicator.cents)} cents flat`
                    : `${Math.abs(tuningIndicator.cents)} cents sharp`}
              </div>

              {/* Visual meter */}
              <div className="relative h-4 bg-secondary rounded-full overflow-hidden max-w-xs mx-auto">
                <div className="absolute inset-y-0 left-1/2 w-1 bg-foreground/30" />
                <div
                  className={`absolute inset-y-0 w-3 rounded-full transition-all ${
                    tuningIndicator.status === "in-tune"
                      ? "bg-green-500"
                      : tuningIndicator.status === "flat"
                        ? "bg-blue-500"
                        : "bg-red-500"
                  }`}
                  style={{
                    left: `${Math.max(0, Math.min(100, 50 + tuningIndicator.cents))}%`,
                    transform: "translateX(-50%)",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* String Buttons */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Struny (kliknij aby uslyszec)</label>
          <div className="grid grid-cols-6 gap-2">
            {selectedTuning.strings.map((string, index) => (
              <button
                key={index}
                onClick={() => playString(index)}
                className={`p-3 rounded-xl border-2 transition-all ${
                  selectedString?.name === string.name
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                } ${playingString === index ? "animate-pulse bg-primary/20" : ""}`}
              >
                <div className="text-lg font-bold">{string.note}</div>
                <div className="text-xs text-muted-foreground">{string.frequency.toFixed(0)} Hz</div>
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {!isListening ? (
            <Button onClick={startListening} size="lg" className="gap-2">
              <Mic className="w-5 h-5" />
              Zacznij strojenie
            </Button>
          ) : (
            <Button onClick={stopListening} variant="destructive" size="lg" className="gap-2">
              <MicOff className="w-5 h-5" />
              Zatrzymaj
            </Button>
          )}

          {playingString !== null && (
            <Button onClick={stopTone} variant="outline" size="lg" className="gap-2">
              <Square className="w-5 h-5" />
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="rounded-xl bg-secondary/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium mb-2">Jak uzywac:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Wybierz stroj gitarowy</li>
          <li>Kliknij strune aby uslyszec dzwiek referencyjny</li>
          <li>Kliknij "Zacznij strojenie" i zagraj strune na gitarze</li>
          <li>Dostosuj strune az wskaznik pokaze "In Tune!"</li>
        </ol>
      </div>
    </div>
  )
}
