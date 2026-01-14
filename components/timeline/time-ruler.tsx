"use client"

import { useRef, useEffect } from "react"

interface TimeRulerProps {
  pixelsPerSecond: number
  duration: number
  scrollX: number
  viewportWidth: number
  onSeek?: (time: number) => void
}

export function TimeRuler({ pixelsPerSecond, duration, scrollX, viewportWidth, onSeek }: TimeRulerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Calculate intervals based on zoom level
  const getInterval = (): number => {
    const pixelsPerMinute = pixelsPerSecond * 60
    if (pixelsPerMinute < 60) return 60 // 1 minute
    if (pixelsPerMinute < 150) return 30 // 30 seconds
    if (pixelsPerMinute < 300) return 10 // 10 seconds
    if (pixelsPerMinute < 600) return 5 // 5 seconds
    return 1 // 1 second
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    const dpr = window.devicePixelRatio || 1
    canvas.width = viewportWidth * dpr
    canvas.height = 40 * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = "#18181b" // bg-card
    ctx.fillRect(0, 0, viewportWidth, 40)

    // Draw time markers
    const interval = getInterval()
    const startTime = Math.floor(scrollX / pixelsPerSecond / interval) * interval
    const endTime = Math.ceil((scrollX + viewportWidth) / pixelsPerSecond / interval) * interval

    ctx.font = "11px monospace"
    ctx.textAlign = "center"

    for (let time = startTime; time <= endTime + interval; time += interval) {
      const x = time * pixelsPerSecond - scrollX

      // Only draw if visible
      if (x < -20 || x > viewportWidth + 20) continue

      // Draw tick mark
      const isMinute = time % 60 === 0
      const isMajor = time % (interval * 5) === 0 || isMinute

      ctx.strokeStyle = isMajor ? "#71717a" : "#3f3f46" // text-muted-foreground / border-border
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, isMajor ? 25 : 30)
      ctx.lineTo(x, 40)
      ctx.stroke()

      // Draw time label
      if (isMajor) {
        const minutes = Math.floor(time / 60)
        const seconds = time % 60
        const label = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}s`

        ctx.fillStyle = "#a1a1aa" // text-muted-foreground
        ctx.fillText(label, x, 15)
      }
    }

    // Draw bottom border
    ctx.strokeStyle = "#27272a" // border-border
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 39.5)
    ctx.lineTo(viewportWidth, 39.5)
    ctx.stroke()
  }, [pixelsPerSecond, duration, scrollX, viewportWidth])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollX
    const time = x / pixelsPerSecond

    onSeek(Math.max(0, Math.min(time, duration)))
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="cursor-pointer"
      style={{ width: viewportWidth, height: 40 }}
    />
  )
}
