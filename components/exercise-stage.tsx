"use client"

/**
 * Scena ćwiczenia: bloki nut docelowych na osi czasu + żywy ślad głosu.
 *
 * Oś X to czas ćwiczenia (znany z góry — aplikacja dyktuje tempo), oś Y to
 * wysokość w MIDI. Ślad rysuje się z ramek zakotwiczonych w recordingStartMs,
 * w tej samej domenie czasu, w której scoring liczy okna nut.
 *
 * Kolor śladu to feedback CHWILOWY (ta ramka w paśmie / poza pasmem).
 * Werdykt liczony jest po medianie nuty z pominięciem ataku, więc pojedynczy
 * czerwony odcinek nie przesądza o pudle — i odwrotnie.
 */

import { useEffect, useRef } from "react"
import type { PitchData } from "@/lib/pitch-detector"
import { frequencyToMidiFloat, midiToLabel, type GeneratedExercise } from "@/lib/exercise-engine"

interface ExerciseStageProps {
  exercise: GeneratedExercise
  /** Ramki od startu nagrania (Date.now() timestamps). */
  pitchHistory: PitchData[]
  /** Moment t=0 ćwiczenia; null = jeszcze nie ruszyło (podgląd). */
  recordingStartMs: number | null
  /** Bieżący postęp w ms względem startu (do kursora); null = bez kursora. */
  elapsedMs: number | null
}

const PADDING_SEMITONES = 3
const HIT_BAND_CENTS = 50

function cssColor(variable: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  return value || fallback
}

export function ExerciseStage({ exercise, pitchHistory, recordingStartMs, elapsedMs }: ExerciseStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    const width = rect.width
    const height = rect.height

    const colorPerfect = cssColor("--pitch-perfect", "#4a9960")
    const colorOff = cssColor("--pitch-off", "#a05545")
    const colorMuted = cssColor("--muted-foreground", "#888")
    const colorBorder = cssColor("--border", "#333")

    ctx.clearRect(0, 0, width, height)

    const midis = exercise.notes.map((n) => n.midi)
    const minMidi = Math.min(...midis) - PADDING_SEMITONES
    const maxMidi = Math.max(...midis) + PADDING_SEMITONES
    const labelGutter = 44

    const xOf = (ms: number) => labelGutter + ((width - labelGutter - 8) * ms) / exercise.totalMs
    const yOf = (midi: number) => height - ((height - 16) * (midi - minMidi)) / (maxMidi - minMidi) - 8

    // Linie półtonów w tle
    ctx.lineWidth = 1
    for (let midi = Math.ceil(minMidi); midi <= Math.floor(maxMidi); midi++) {
      const y = yOf(midi)
      ctx.strokeStyle = colorBorder
      ctx.globalAlpha = midi % 12 === 0 ? 0.5 : 0.18
      ctx.beginPath()
      ctx.moveTo(labelGutter, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Bloki nut docelowych: pasmo trafienia ±50¢ + etykieta nuty i sylaby
    for (const note of exercise.notes) {
      const x = xOf(note.startMs)
      const w = xOf(note.startMs + note.durationMs) - x
      const bandHalf = Math.abs(yOf(note.midi + HIT_BAND_CENTS / 100) - yOf(note.midi))

      ctx.fillStyle = colorPerfect
      ctx.globalAlpha = 0.18
      ctx.beginPath()
      ctx.roundRect(x, yOf(note.midi) - bandHalf, w, bandHalf * 2, 6)
      ctx.fill()
      ctx.globalAlpha = 0.9
      ctx.fillRect(x, yOf(note.midi) - 1, w, 2)

      ctx.globalAlpha = 1
      ctx.fillStyle = colorMuted
      ctx.font = "11px system-ui, sans-serif"
      ctx.textAlign = "left"
      ctx.fillText(midiToLabel(note.midi), x + 4, yOf(note.midi) - bandHalf - 4)
    }

    // Etykiety skrajnych nut w rynnie
    ctx.fillStyle = colorMuted
    ctx.font = "10px system-ui, sans-serif"
    ctx.textAlign = "right"
    for (let midi = Math.ceil(minMidi); midi <= Math.floor(maxMidi); midi++) {
      if (midi % 2 === 0) ctx.fillText(midiToLabel(midi), labelGutter - 6, yOf(midi) + 3)
    }

    // Ślad głosu
    if (recordingStartMs !== null && pitchHistory.length > 0) {
      ctx.lineWidth = 2.5
      ctx.lineCap = "round"
      let previous: { x: number; y: number; withinBand: boolean } | null = null

      for (const frame of pitchHistory) {
        const ms = frame.timestamp - recordingStartMs
        if (ms < 0 || ms > exercise.totalMs || frame.frequency <= 0) {
          previous = null
          continue
        }
        const midi = frequencyToMidiFloat(frame.frequency)
        if (midi < minMidi || midi > maxMidi) {
          previous = null
          continue
        }

        const active = exercise.notes.find(
          (n) => ms >= n.startMs && ms <= n.startMs + n.durationMs,
        )
        const withinBand =
          active !== undefined && Math.abs(midi - active.midi) * 100 <= HIT_BAND_CENTS

        const point = { x: xOf(ms), y: yOf(midi), withinBand }
        if (previous && point.x - previous.x < 40) {
          ctx.strokeStyle = withinBand ? colorPerfect : colorOff
          ctx.beginPath()
          ctx.moveTo(previous.x, previous.y)
          ctx.lineTo(point.x, point.y)
          ctx.stroke()
        }
        previous = point
      }
    }

    // Kursor postępu
    if (elapsedMs !== null && elapsedMs >= 0 && elapsedMs <= exercise.totalMs) {
      const x = xOf(elapsedMs)
      ctx.strokeStyle = colorMuted
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, 4)
      ctx.lineTo(x, height - 4)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }, [exercise, pitchHistory, recordingStartMs, elapsedMs])

  return <canvas ref={canvasRef} className="w-full h-full" />
}
