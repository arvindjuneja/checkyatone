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
import { applyHannWindow, computeRms, detectF0, fundamentalPresence } from "@/lib/yin"
import { frequencyToNote } from "@/lib/pitch-detector"
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
  /**
   * Do kiedy detekcja jest wyciszona. Ton wzorcowy gra z głośnika przy
   * otwartym mikrofonie — bez bramki wskaźnik pokazuje "nastrojona" dla
   * dźwięku, który sam wygenerował, bo referencja Z DEFINICJI leży na
   * częstotliwości docelowej.
   */
  const playbackMuteUntilRef = useRef(0)
  /**
   * Unieważnia sesję nasłuchu w locie. `startListening` czeka na getUserMedia;
   * odmontowanie albo stop w trakcie tego oczekiwania zostawiały żywy mikrofon
   * i pętlę rAF, której nikt już nie mógł anulować, bo refy dostawały wartości
   * dopiero PO sprzątaniu.
   */
  const listenSessionRef = useRef(0)
  /** Ramki z rzędu bez ważnego odczytu — po progu czyścimy wyświetlacz. */
  const staleFramesRef = useRef(0)

  // Start listening to microphone
  const startListening = useCallback(async () => {
    const session = ++listenSessionRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      // Sesja unieważniona w trakcie oczekiwania (stop albo unmount):
      // oddajemy mikrofon i nie startujemy pętli.
      if (listenSessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)

      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0
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
    ++listenSessionRef.current
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

  /**
   * Zakres tunera: 60 Hz to ~3,5 półtonu pod najniższą struną obsługiwanych
   * strojów (D2 = 73,4 Hz) — struna, którą się stroi, jest z definicji
   * rozstrojona, więc margines w dół jest częścią zadania. Góra z zapasem
   * na flażolety i wyższe pozycje.
   */
  const TUNER_MIN_HZ = 60
  const TUNER_MAX_HZ = 1200
  const RMS_GATE = 0.01
  /**
   * Tylko ścieżka progowa YIN. detectF0 poniżej progu bezwzględnego zwraca
   * globalne minimum CMNDF z niską pewnością — rdzeń wprost każe takie ramki
   * odrzucać. Ścieżka progowa ma CMNDF < 0,15, czyli pewność > 0,85; wszystko
   * niżej to zgadywanie (dwie struny naraz, atak kostki, ogon wybrzmienia).
   */
  const CONFIDENCE_GATE = 0.85
  /** Po tylu ramkach bez ważnego odczytu wyświetlacz gaśnie (~0,25 s). */
  const STALE_FRAME_LIMIT = 15
  /**
   * Prążek f0 musi nieść ≥5% energii najsilniejszej harmonicznej (−26 dB).
   * Odcina wirtualne fundamentalne dwóch strun naraz: B3+E4 są okresowe
   * w 82,4 Hz, ale na 82,4 Hz nie ma tam żadnej energii.
   */
  const FUNDAMENTAL_PRESENCE_FLOOR = 0.05

  const detectPitch = useCallback(() => {
    if (!analyserRef.current) return

    const analyser = analyserRef.current
    const buffer = new Float32Array(analyser.fftSize)

    const detect = () => {
      analyser.getFloatTimeDomainData(buffer)

      let validReading = false

      if (Date.now() < playbackMuteUntilRef.current) {
        // Głośnik nie stroi gitary.
        setDetectedFrequency(null)
        setDetectedNote(null)
        staleFramesRef.current = 0
      } else if (computeRms(buffer) >= RMS_GATE) {
        const result = detectF0(buffer, audioContextRef.current!.sampleRate, {
          minFrequency: TUNER_MIN_HZ,
          maxFrequency: TUNER_MAX_HZ,
        })

        if (
          result &&
          result.confidence >= CONFIDENCE_GATE &&
          fundamentalPresence(applyHannWindow(buffer), audioContextRef.current!.sampleRate, result.frequency) >=
            FUNDAMENTAL_PRESENCE_FLOOR
        ) {
          const info = frequencyToNote(result.frequency)
          setDetectedFrequency(result.frequency)
          setDetectedNote(`${info.note}${info.octave}`)
          validReading = true
        }
      }

      // Bez tego ostatni odczyt wisiał na ekranie w nieskończoność —
      // "Nastrojona!" świeciło w ciszy długo po odłożeniu gitary.
      if (!validReading) {
        staleFramesRef.current++
        if (staleFramesRef.current > STALE_FRAME_LIMIT) {
          setDetectedFrequency(null)
          setDetectedNote(null)
        }
      } else {
        staleFramesRef.current = 0
      }

      animationRef.current = requestAnimationFrame(detect)
    }

    detect()
  }, [])

  /** Czas tonu wzorcowego i ogon na wybrzmienie głośnika/pokoju. */
  const REFERENCE_TONE_MS = 2000
  const PLAYBACK_TAIL_MS = 350

  // Play reference tone for a string
  const playString = useCallback((stringIndex: number) => {
    // Stop any currently playing tone
    if (currentToneRef.current) {
      currentToneRef.current.stop()
    }

    const string = selectedTuning.strings[stringIndex]
    setPlayingString(stringIndex)
    setSelectedString(string)

    playbackMuteUntilRef.current = Date.now() + REFERENCE_TONE_MS + PLAYBACK_TAIL_MS
    currentToneRef.current = playGuitarString(string.frequency, REFERENCE_TONE_MS / 1000)

    setTimeout(() => {
      setPlayingString(null)
    }, REFERENCE_TONE_MS)
  }, [selectedTuning])

  // Stop playing tone
  const stopTone = useCallback(() => {
    if (currentToneRef.current) {
      currentToneRef.current.stop()
      currentToneRef.current = null
    }
    // Ogon po ręcznym zatrzymaniu: głośnik i pokój wybrzmiewają dłużej niż UI.
    playbackMuteUntilRef.current = Date.now() + PLAYBACK_TAIL_MS
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
