"use client"

import { useRef, useEffect, useCallback } from "react"
import { type PitchData, getPitchAccuracy } from "@/lib/pitch-detector"

interface PitchVisualizerProps {
  pitchHistory: PitchData[]
  currentPitch: PitchData | null
  isRecording: boolean
}

interface NoteRibbon {
  note: string
  octave: number
  points: { x: number; cents: number; accuracy: "perfect" | "good" | "off" }[]
  startTime: number
  endTime: number
}

const ALL_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
const VISIBLE_DURATION = 6000

function calculateVisibleRange(
  pitchHistory: PitchData[],
  currentPitch: PitchData | null,
): { minOctave: number; maxOctave: number; minSemitone: number; maxSemitone: number } {
  const now = Date.now()
  const recentPitches = pitchHistory.filter((p) => now - p.timestamp < VISIBLE_DURATION)

  const allPitches = currentPitch ? [...recentPitches, currentPitch] : recentPitches

  if (allPitches.length === 0) {
    return { minOctave: 3, maxOctave: 5, minSemitone: 36, maxSemitone: 72 }
  }

  const semitones = allPitches.map((p) => {
    const noteIdx = ALL_NOTES.indexOf(p.note)
    return p.octave * 12 + noteIdx
  })

  const minSemitone = Math.min(...semitones)
  const maxSemitone = Math.max(...semitones)

  const paddedMin = minSemitone - 4
  const paddedMax = maxSemitone + 4

  const range = paddedMax - paddedMin
  const minRange = 24

  let finalMin = paddedMin
  let finalMax = paddedMax

  if (range < minRange) {
    const padding = Math.floor((minRange - range) / 2)
    finalMin = paddedMin - padding
    finalMax = paddedMax + padding
  }

  finalMin = Math.max(12, finalMin)
  finalMax = Math.min(96, finalMax)

  return {
    minOctave: Math.floor(finalMin / 12),
    maxOctave: Math.ceil(finalMax / 12),
    minSemitone: finalMin,
    maxSemitone: finalMax,
  }
}

export function PitchVisualizer({ pitchHistory, currentPitch, isRecording }: PitchVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const currentRangeRef = useRef({ minSemitone: 36, maxSemitone: 72 })

  const draw = useCallback(() => {
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
    const pianoWidth = 60
    const timelineWidth = width - pianoWidth

    // Background - graphite gradient (neutral)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
    bgGradient.addColorStop(0, "oklch(0.14 0.005 0)")
    bgGradient.addColorStop(1, "oklch(0.12 0.005 0)")
    ctx.fillStyle = bgGradient
    ctx.fillRect(0, 0, width, height)

    const targetRange = calculateVisibleRange(pitchHistory, currentPitch)
    const lerp = 0.15
    currentRangeRef.current.minSemitone += (targetRange.minSemitone - currentRangeRef.current.minSemitone) * lerp
    currentRangeRef.current.maxSemitone += (targetRange.maxSemitone - currentRangeRef.current.maxSemitone) * lerp

    const minSemitone = Math.round(currentRangeRef.current.minSemitone)
    const maxSemitone = Math.round(currentRangeRef.current.maxSemitone)
    const totalSemitones = maxSemitone - minSemitone + 1
    const noteHeight = height / totalSemitones

    for (let semitone = maxSemitone; semitone >= minSemitone; semitone--) {
      const noteIdx = ((semitone % 12) + 12) % 12
      const octave = Math.floor(semitone / 12)
      const note = ALL_NOTES[noteIdx]
      const y = (maxSemitone - semitone) * noteHeight
      const isBlack = note.includes("#")

      // Piano key - warm ivory for white, graphite for black
      const gradient = ctx.createLinearGradient(0, 0, pianoWidth - 2, 0)
      if (isBlack) {
        gradient.addColorStop(0, "oklch(0.18 0.005 0)")
        gradient.addColorStop(1, "oklch(0.14 0.005 0)")
      } else {
        gradient.addColorStop(0, "oklch(0.92 0.01 90)")
        gradient.addColorStop(1, "oklch(0.88 0.01 90)")
      }
      ctx.fillStyle = gradient
      ctx.fillRect(0, y, pianoWidth - 2, noteHeight - 1)

      if (!isBlack) {
        ctx.strokeStyle = "oklch(0.75 0.005 0)"
        ctx.lineWidth = 1
        ctx.strokeRect(0, y, pianoWidth - 2, noteHeight - 1)
      }

      if (isBlack) {
        const blackKeyWidth = pianoWidth * 0.6
        const blackGradient = ctx.createLinearGradient(pianoWidth - blackKeyWidth - 2, 0, pianoWidth - 2, 0)
        blackGradient.addColorStop(0, "oklch(0.18 0.005 0)")
        blackGradient.addColorStop(1, "oklch(0.12 0.005 0)")
        ctx.fillStyle = blackGradient
        ctx.fillRect(pianoWidth - blackKeyWidth - 2, y, blackKeyWidth, noteHeight - 1)

        ctx.strokeStyle = "oklch(0.10 0.005 0)"
        ctx.lineWidth = 1
        ctx.strokeRect(pianoWidth - blackKeyWidth - 2, y, blackKeyWidth, noteHeight - 1)
      }

      // Lane background - graphite
      ctx.fillStyle = isBlack ? "oklch(0.12 0.005 0)" : "oklch(0.14 0.005 0)"
      ctx.fillRect(pianoWidth, y, timelineWidth, noteHeight)

      // Lane line - subtle graphite
      ctx.strokeStyle = "oklch(0.20 0.005 0)"
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(pianoWidth, y + noteHeight)
      ctx.lineTo(width, y + noteHeight)
      ctx.stroke()

      // Note label - neutral tones
      const showLabel = note === "C" || (noteHeight > 15 && !isBlack)
      if (showLabel) {
        ctx.fillStyle = isBlack ? "oklch(0.60 0.005 0)" : "oklch(0.30 0.005 0)"
        ctx.font = noteHeight > 12 ? "bold 10px Inter, system-ui" : "bold 8px Inter, system-ui"
        ctx.textAlign = "right"
        ctx.textBaseline = "middle"
        const labelX = isBlack ? pianoWidth - 6 : pianoWidth - 10
        ctx.fillText(`${note}${octave}`, labelX, y + noteHeight / 2)
      }
    }

    // Time markers - muted
    const now = Date.now()
    const startTime = now - VISIBLE_DURATION
    ctx.fillStyle = "oklch(0.50 0.005 0)"
    ctx.font = "10px Inter, system-ui"
    ctx.textAlign = "left"
    for (let t = 0; t <= VISIBLE_DURATION; t += 1000) {
      const x = pianoWidth + (t / VISIBLE_DURATION) * timelineWidth
      ctx.fillText(`${Math.floor(t / 1000)}s`, x + 2, height - 4)
    }

    // Filter visible pitches
    const visiblePitches = pitchHistory.filter((p) => p.timestamp >= startTime)

    if (visiblePitches.length > 0) {
      const ribbons: NoteRibbon[] = []
      let currentRibbon: NoteRibbon | null = null

      visiblePitches.forEach((pitch) => {
        const noteKey = `${pitch.note}${pitch.octave}`
        const x = pianoWidth + ((pitch.timestamp - startTime) / VISIBLE_DURATION) * timelineWidth
        const accuracy = getPitchAccuracy(pitch.cents)

        if (
          !currentRibbon ||
          `${currentRibbon.note}${currentRibbon.octave}` !== noteKey ||
          pitch.timestamp - currentRibbon.endTime > 200
        ) {
          if (currentRibbon) ribbons.push(currentRibbon)
          currentRibbon = {
            note: pitch.note,
            octave: pitch.octave,
            points: [{ x, cents: pitch.cents, accuracy }],
            startTime: pitch.timestamp,
            endTime: pitch.timestamp,
          }
        } else {
          currentRibbon.points.push({ x, cents: pitch.cents, accuracy })
          currentRibbon.endTime = pitch.timestamp
        }
      })
      if (currentRibbon) ribbons.push(currentRibbon)

      // Draw ribbons with new harmonious colors
      ribbons.forEach((ribbon) => {
        const noteIdx = ALL_NOTES.indexOf(ribbon.note)
        if (noteIdx === -1) return

        const semitone = ribbon.octave * 12 + noteIdx
        if (semitone < minSemitone || semitone > maxSemitone) return

        const y = (maxSemitone - semitone) * noteHeight
        const laneCenterY = y + noteHeight / 2

        const accuracyCounts = { perfect: 0, good: 0, off: 0 }
        ribbon.points.forEach((p) => accuracyCounts[p.accuracy]++)
        const dominantAccuracy =
          accuracyCounts.perfect >= accuracyCounts.good && accuracyCounts.perfect >= accuracyCounts.off
            ? "perfect"
            : accuracyCounts.good >= accuracyCounts.off
              ? "good"
              : "off"

        // Pitch feedback colors (using design system vars)
        const colors = {
          perfect: {
            fill: "oklch(0.55 0.12 145 / 0.80)",
            stroke: "oklch(0.60 0.14 145)",
            glow: "oklch(0.55 0.12 145 / 0.35)",
          },
          good: {
            fill: "oklch(0.60 0.08 85 / 0.80)",
            stroke: "oklch(0.65 0.10 85)",
            glow: "oklch(0.60 0.08 85 / 0.35)",
          },
          off: {
            fill: "oklch(0.50 0.10 25 / 0.80)",
            stroke: "oklch(0.55 0.12 25)",
            glow: "oklch(0.50 0.10 25 / 0.35)",
          },
        }
        const color = colors[dominantAccuracy]

        if (ribbon.points.length < 2) {
          const p = ribbon.points[0]
          ctx.beginPath()
          ctx.arc(p.x, laneCenterY, noteHeight / 3, 0, Math.PI * 2)
          ctx.fillStyle = color.fill
          ctx.fill()
          ctx.strokeStyle = color.stroke
          ctx.lineWidth = 2
          ctx.stroke()
          return
        }

        const ribbonHeight = noteHeight * 0.7

        ctx.beginPath()
        ribbon.points.forEach((p, i) => {
          const centsOffset = (p.cents / 50) * (ribbonHeight / 4)
          const yPos = laneCenterY - ribbonHeight / 2 + centsOffset
          if (i === 0) ctx.moveTo(p.x, yPos)
          else ctx.lineTo(p.x, yPos)
        })

        for (let i = ribbon.points.length - 1; i >= 0; i--) {
          const p = ribbon.points[i]
          const centsOffset = (p.cents / 50) * (ribbonHeight / 4)
          const yPos = laneCenterY + ribbonHeight / 2 + centsOffset
          ctx.lineTo(p.x, yPos)
        }

        ctx.closePath()
        ctx.shadowColor = color.glow
        ctx.shadowBlur = 10
        ctx.fillStyle = color.fill
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.strokeStyle = color.stroke
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Center pitch deviation line
        ctx.beginPath()
        ctx.strokeStyle = "oklch(0.55 0.12 145)"
        ctx.lineWidth = 1.5
        ribbon.points.forEach((p, i) => {
          const centsOffset = (p.cents / 50) * (ribbonHeight / 2)
          const yPos = laneCenterY + centsOffset
          if (i === 0) ctx.moveTo(p.x, yPos)
          else ctx.lineTo(p.x, yPos)
        })
        ctx.stroke()
      })
    }

    // Current pitch indicator - uses primary orange
    if (currentPitch && isRecording) {
      const noteIdx = ALL_NOTES.indexOf(currentPitch.note)
      if (noteIdx !== -1) {
        const semitone = currentPitch.octave * 12 + noteIdx
        if (semitone >= minSemitone && semitone <= maxSemitone) {
          const y = (maxSemitone - semitone) * noteHeight + noteHeight / 2

          ctx.strokeStyle = "oklch(0.72 0.18 45 / 0.35)"
          ctx.lineWidth = 1
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(pianoWidth, y)
          ctx.lineTo(width, y)
          ctx.stroke()
          ctx.setLineDash([])

          ctx.beginPath()
          ctx.arc(width - 12, y, 8, 0, Math.PI * 2)
          ctx.shadowColor = "oklch(0.72 0.18 45 / 0.45)"
          ctx.shadowBlur = 10
          ctx.fillStyle = "oklch(0.72 0.18 45)"
          ctx.fill()
          ctx.shadowBlur = 0

          ctx.beginPath()
          ctx.arc(width - 12, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = "oklch(0.92 0.01 90)"
          ctx.fill()
        }
      }
    }

    // Recording indicator - red with pulse
    if (isRecording) {
      const pulse = (Math.sin(Date.now() / 200) + 1) / 2
      ctx.beginPath()
      ctx.arc(width - 12, 12, 4 + pulse * 2, 0, Math.PI * 2)
      ctx.shadowColor = "oklch(0.50 0.10 25 / 0.45)"
      ctx.shadowBlur = 8 * pulse
      ctx.fillStyle = `oklch(0.50 0.10 25 / ${0.7 + pulse * 0.3})`
      ctx.fill()
      ctx.shadowBlur = 0
    }
  }, [pitchHistory, currentPitch, isRecording])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      return
    }

    const animate = () => {
      draw()
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [isRecording, draw])

  return <canvas ref={canvasRef} className="w-full h-full rounded-2xl" />
}
