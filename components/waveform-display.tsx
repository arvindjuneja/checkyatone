"use client"

import { useEffect, useRef } from "react"

interface WaveformDisplayProps {
  waveformData: Float32Array
  color?: string
  height?: number
  label?: string
}

export function WaveformDisplay({
  waveformData,
  color = "hsl(var(--pitch-perfect))",
  height = 80,
  label,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.clearRect(0, 0, width, height)

    // Fill background
    ctx.fillStyle = "hsl(var(--secondary))"
    ctx.fillRect(0, 0, width, height)

    // Draw center line
    ctx.strokeStyle = "hsl(var(--border))"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    // Draw waveform with fill
    ctx.fillStyle = color
    ctx.globalAlpha = 0.3
    ctx.beginPath()

    const step = width / waveformData.length
    const amplitudeScale = height / 2

    // Draw filled waveform shape
    ctx.moveTo(0, height / 2)

    // Top half
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * step
      const y = height / 2 - waveformData[i] * amplitudeScale
      ctx.lineTo(x, y)
    }

    // Return to center at end
    ctx.lineTo(width, height / 2)

    // Bottom half (mirrored)
    for (let i = waveformData.length - 1; i >= 0; i--) {
      const x = i * step
      const y = height / 2 + waveformData[i] * amplitudeScale
      ctx.lineTo(x, y)
    }

    ctx.closePath()
    ctx.fill()

    // Draw outline
    ctx.globalAlpha = 1
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()

    for (let i = 0; i < waveformData.length; i++) {
      const x = i * step
      const y = height / 2 - waveformData[i] * amplitudeScale

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()

    // Mirror outline
    ctx.beginPath()
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * step
      const y = height / 2 + waveformData[i] * amplitudeScale

      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }, [waveformData, color, height])

  return (
    <div className="relative">
      {label && (
        <div className="absolute top-2 left-2 text-xs font-semibold text-muted-foreground bg-background/80 px-2 py-1 rounded">
          {label}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        className="w-full rounded-lg bg-secondary/20"
        style={{ height: `${height}px` }}
      />
    </div>
  )
}
