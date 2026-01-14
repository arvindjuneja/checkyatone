"use client"

import { useState, useRef, useEffect } from "react"

interface PlayheadProps {
  currentTime: number
  pixelsPerSecond: number
  scrollX: number
  viewportWidth: number
  onSeek?: (time: number) => void
}

export function Playhead({ currentTime, pixelsPerSecond, scrollX, viewportWidth, onSeek }: PlayheadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragOffsetRef = useRef(0)

  const xPosition = currentTime * pixelsPerSecond - scrollX

  // Only show if in viewport (with some margin)
  const isVisible = xPosition >= -10 && xPosition <= viewportWidth + 10

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onSeek) return
    setIsDragging(true)
    dragOffsetRef.current = 0
    e.preventDefault()
  }

  useEffect(() => {
    if (!isDragging || !onSeek) return

    const handleMouseMove = (e: MouseEvent) => {
      const newTime = (e.clientX + scrollX - dragOffsetRef.current) / pixelsPerSecond
      onSeek(Math.max(0, newTime))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, onSeek, pixelsPerSecond, scrollX])

  if (!isVisible) return null

  return (
    <>
      {/* Playhead line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-50 pointer-events-none"
        style={{ left: xPosition }}
      />

      {/* Playhead handle (draggable) */}
      <div
        className="absolute top-0 w-3 h-3 bg-red-500 rounded-full z-50 cursor-ew-resize transform -translate-x-1/2"
        style={{ left: xPosition }}
        onMouseDown={handleMouseDown}
        title="Drag to seek"
      />

      {/* Time tooltip when dragging */}
      {isDragging && (
        <div
          className="absolute top-4 bg-card border border-border rounded px-2 py-1 text-xs font-mono z-50 pointer-events-none transform -translate-x-1/2"
          style={{ left: xPosition }}
        >
          {formatTime(currentTime)}
        </div>
      )}
    </>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(1)
  return `${mins}:${secs.padStart(4, "0")}`
}
