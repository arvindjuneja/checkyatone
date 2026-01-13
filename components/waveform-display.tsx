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

    // Fill background (subtle)
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
    ctx.fillRect(0, 0, width, height)

    // Draw center line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    const step = width / waveformData.length
    const amplitudeScale = height / 2

    // Draw bars for each sample (like a proper audio waveform)
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * step
      const barHeight = waveformData[i] * amplitudeScale

      // Draw semi-transparent bar
      ctx.fillStyle = color + "33" // Add 20% opacity
      ctx.fillRect(x, height / 2 - barHeight, Math.max(1, step * 0.8), barHeight * 2)

      // Draw brighter center line
      ctx.fillStyle = color
      ctx.fillRect(x, height / 2 - barHeight, Math.max(1, step * 0.8), 2)
      ctx.fillRect(x, height / 2 + barHeight - 2, Math.max(1, step * 0.8), 2)
    }
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
