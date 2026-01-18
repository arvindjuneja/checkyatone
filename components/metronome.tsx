"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Play, Pause, Minus, Plus } from "lucide-react"

interface MetronomeProps {
  className?: string
}

type TimeSignature = "4/4" | "3/4" | "6/8" | "2/4"

const TIME_SIGNATURES: { value: TimeSignature; label: string; beats: number }[] = [
  { value: "4/4", label: "4/4", beats: 4 },
  { value: "3/4", label: "3/4", beats: 3 },
  { value: "6/8", label: "6/8", beats: 6 },
  { value: "2/4", label: "2/4", beats: 2 },
]

export function Metronome({ className = "" }: MetronomeProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(120)
  const [timeSignature, setTimeSignature] = useState<TimeSignature>("4/4")
  const [currentBeat, setCurrentBeat] = useState(0)
  const [tapTimes, setTapTimes] = useState<number[]>([])

  const audioContextRef = useRef<AudioContext | null>(null)
  const nextNoteTimeRef = useRef(0)
  const timerIdRef = useRef<number | null>(null)
  const currentBeatRef = useRef(0)

  const beatsInMeasure = TIME_SIGNATURES.find((t) => t.value === timeSignature)?.beats || 4

  // Create click sound using Web Audio API
  const playClick = useCallback((isAccent: boolean) => {
    if (!audioContextRef.current) return

    const ctx = audioContextRef.current
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    // Higher pitch for accent (first beat)
    oscillator.frequency.value = isAccent ? 1000 : 800
    oscillator.type = "square"

    // Short click envelope
    const now = ctx.currentTime
    gainNode.gain.setValueAtTime(0.3, now)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05)

    oscillator.start(now)
    oscillator.stop(now + 0.05)
  }, [])

  // Scheduler for precise timing
  const scheduler = useCallback(() => {
    if (!audioContextRef.current) return

    const ctx = audioContextRef.current
    const secondsPerBeat = 60.0 / bpm
    const scheduleAheadTime = 0.1 // Schedule 100ms ahead

    while (nextNoteTimeRef.current < ctx.currentTime + scheduleAheadTime) {
      // Schedule the click
      const isAccent = currentBeatRef.current === 0

      // Schedule audio
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.value = isAccent ? 1000 : 800
      oscillator.type = "square"
      gainNode.gain.setValueAtTime(isAccent ? 0.4 : 0.3, nextNoteTimeRef.current)
      gainNode.gain.exponentialRampToValueAtTime(0.001, nextNoteTimeRef.current + 0.05)
      oscillator.start(nextNoteTimeRef.current)
      oscillator.stop(nextNoteTimeRef.current + 0.05)

      // Update visual beat (with slight delay for sync)
      const beatToShow = currentBeatRef.current
      setTimeout(() => {
        setCurrentBeat(beatToShow)
      }, (nextNoteTimeRef.current - ctx.currentTime) * 1000)

      // Advance to next beat
      currentBeatRef.current = (currentBeatRef.current + 1) % beatsInMeasure
      nextNoteTimeRef.current += secondsPerBeat
    }
  }, [bpm, beatsInMeasure])

  // Start/stop metronome
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      // Stop
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current)
        timerIdRef.current = null
      }
      setIsPlaying(false)
      setCurrentBeat(0)
      currentBeatRef.current = 0
    } else {
      // Start
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume()
      }

      currentBeatRef.current = 0
      nextNoteTimeRef.current = audioContextRef.current.currentTime
      setIsPlaying(true)

      // Use setInterval for the scheduler
      timerIdRef.current = window.setInterval(scheduler, 25)
    }
  }, [isPlaying, scheduler])

  // Update scheduler when BPM or time signature changes
  useEffect(() => {
    if (isPlaying && timerIdRef.current) {
      clearInterval(timerIdRef.current)
      timerIdRef.current = window.setInterval(scheduler, 25)
    }
  }, [bpm, beatsInMeasure, isPlaying, scheduler])

  // Reset beat when time signature changes
  useEffect(() => {
    currentBeatRef.current = 0
    setCurrentBeat(0)
  }, [timeSignature])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIdRef.current) {
        clearInterval(timerIdRef.current)
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Tap tempo
  const handleTapTempo = useCallback(() => {
    const now = Date.now()
    const newTapTimes = [...tapTimes, now].filter((t) => now - t < 3000) // Keep taps within 3 seconds

    if (newTapTimes.length >= 2) {
      const intervals: number[] = []
      for (let i = 1; i < newTapTimes.length; i++) {
        intervals.push(newTapTimes[i] - newTapTimes[i - 1])
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const calculatedBpm = Math.round(60000 / avgInterval)
      setBpm(Math.min(240, Math.max(40, calculatedBpm)))
    }

    setTapTimes(newTapTimes)
  }, [tapTimes])

  // BPM adjustment
  const adjustBpm = (delta: number) => {
    setBpm((prev) => Math.min(240, Math.max(40, prev + delta)))
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Beat Indicator */}
      <div className="flex justify-center gap-3">
        {Array.from({ length: beatsInMeasure }).map((_, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-full transition-all duration-75 ${
              currentBeat === i && isPlaying
                ? i === 0
                  ? "bg-primary scale-125 shadow-lg shadow-primary/50"
                  : "bg-pitch-perfect scale-110"
                : "bg-secondary"
            }`}
          />
        ))}
      </div>

      {/* BPM Display and Control */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => adjustBpm(-5)}
            className="w-12 h-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors"
          >
            <Minus className="w-5 h-5" />
          </button>

          <div className="w-32 text-center">
            <input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(Math.min(240, Math.max(40, parseInt(e.target.value) || 40)))}
              className="text-5xl font-bold bg-transparent text-center w-full focus:outline-none"
              min={40}
              max={240}
            />
            <p className="text-sm text-muted-foreground">BPM</p>
          </div>

          <button
            onClick={() => adjustBpm(5)}
            className="w-12 h-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* BPM Slider */}
        <input
          type="range"
          min={40}
          max={240}
          value={bpm}
          onChange={(e) => setBpm(parseInt(e.target.value))}
          className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-primary
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-primary
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:cursor-pointer"
        />

        {/* BPM Presets */}
        <div className="flex justify-center gap-2 flex-wrap">
          {[60, 80, 100, 120, 140, 160].map((preset) => (
            <button
              key={preset}
              onClick={() => setBpm(preset)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                bpm === preset
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80 text-muted-foreground"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Time Signature */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-center block">Metrum</label>
        <div className="flex justify-center gap-2">
          {TIME_SIGNATURES.map((ts) => (
            <button
              key={ts.value}
              onClick={() => setTimeSignature(ts.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                timeSignature === ts.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80 text-muted-foreground"
              }`}
            >
              {ts.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4">
        <button
          onClick={togglePlay}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isPlaying
              ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              : "bg-primary hover:bg-primary/90 text-primary-foreground"
          }`}
        >
          {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
        </button>
      </div>

      {/* Tap Tempo */}
      <div className="text-center">
        <button
          onClick={handleTapTempo}
          className="px-6 py-3 bg-secondary hover:bg-secondary/80 rounded-xl text-sm font-medium transition-colors"
        >
          Tap Tempo
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          Kliknij kilka razy w rytm, aby ustawic tempo
        </p>
      </div>
    </div>
  )
}
