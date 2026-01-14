"use client"

import { useState, useRef, useEffect } from "react"
import type { AudioClip as AudioClipType, AudioSource } from "@/lib/multi-track-storage"

interface AudioClipProps {
  clip: AudioClipType
  source: AudioSource
  trackColor: string
  pixelsPerSecond: number
  isSelected: boolean
  isMuted: boolean
  onSelect?: (clipId: string, addToSelection: boolean) => void
  onUpdatePosition?: (clipId: string, startTime: number) => void
  onUpdateTrim?: (clipId: string, trimStart: number, trimEnd: number) => void
}

export function AudioClip({
  clip,
  source,
  trackColor,
  pixelsPerSecond,
  isSelected,
  isMuted,
  onSelect,
  onUpdatePosition,
  onUpdateTrim,
}: AudioClipProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartTime, setDragStartTime] = useState(0)
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)
  const [resizeStartTrim, setResizeStartTrim] = useState({ start: 0, end: 0 })
  const [resizeStartPosition, setResizeStartPosition] = useState({ x: 0, startTime: 0 })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Calculate visual duration (actual duration minus trim)
  const visualDuration = clip.duration - clip.trimStart - clip.trimEnd
  const width = visualDuration * pixelsPerSecond
  const left = clip.startTime * pixelsPerSecond

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source.waveformData) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const height = 80
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Draw waveform
    const waveform = source.waveformData
    const samplesPerPixel = waveform.length / (source.duration * pixelsPerSecond)

    // Calculate which part of waveform to show based on trim
    const startSample = Math.floor(clip.trimStart * pixelsPerSecond * samplesPerPixel)
    const endSample = Math.ceil((clip.duration - clip.trimEnd) * pixelsPerSecond * samplesPerPixel)

    ctx.fillStyle = isMuted ? "#71717a" : trackColor
    ctx.globalAlpha = isMuted ? 0.3 : 0.8

    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor(startSample + (x / width) * (endSample - startSample))
      if (sampleIndex >= 0 && sampleIndex < waveform.length) {
        const amplitude = waveform[sampleIndex]
        const barHeight = amplitude * height * 0.8

        ctx.fillRect(x, (height - barHeight) / 2, 1, barHeight)
      }
    }

    ctx.globalAlpha = 1
  }, [clip, source, trackColor, isMuted, width, pixelsPerSecond])

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return // Left click only

    // Check if clicking on resize handles
    const target = e.target as HTMLElement
    if (target.classList.contains('resize-handle')) {
      return // Let the resize handles handle this
    }

    // Select clip
    if (onSelect) {
      onSelect(clip.id, e.metaKey || e.ctrlKey)
    }

    // Start drag
    if (onUpdatePosition) {
      console.log('[AudioClip] Starting drag for clip:', clip.name)
      setIsDragging(true)
      setDragStartX(e.clientX)
      setDragStartTime(clip.startTime)
      e.preventDefault()
    }
  }

  const handleLeftEdgeMouseDown = (e: React.MouseEvent) => {
    console.log('[AudioClip] Starting left trim for clip:', clip.name)
    e.stopPropagation()
    setIsResizingLeft(true)
    setResizeStartPosition({ x: e.clientX, startTime: clip.startTime })
    setResizeStartTrim({ start: clip.trimStart, end: clip.trimEnd })
  }

  const handleRightEdgeMouseDown = (e: React.MouseEvent) => {
    console.log('[AudioClip] Starting right trim for clip:', clip.name)
    e.stopPropagation()
    setIsResizingRight(true)
    setResizeStartPosition({ x: e.clientX, startTime: clip.startTime })
    setResizeStartTrim({ start: clip.trimStart, end: clip.trimEnd })
  }

  // Handle dragging
  useEffect(() => {
    if (!isDragging || !onUpdatePosition) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX
      const deltaTime = deltaX / pixelsPerSecond
      const newStartTime = Math.max(0, dragStartTime + deltaTime)

      onUpdatePosition(clip.id, newStartTime)
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
  }, [isDragging, clip.id, dragStartX, dragStartTime, pixelsPerSecond, onUpdatePosition])

  // Handle left edge resize (trim start)
  useEffect(() => {
    if (!isResizingLeft || !onUpdateTrim || !onUpdatePosition) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartPosition.x
      const deltaTime = deltaX / pixelsPerSecond

      // Calculate new trim start and position
      const newTrimStart = Math.max(0, Math.min(clip.duration - clip.trimEnd - 0.1, resizeStartTrim.start + deltaTime))
      const trimDelta = newTrimStart - resizeStartTrim.start
      const newStartTime = resizeStartPosition.startTime + trimDelta

      onUpdateTrim(clip.id, newTrimStart, clip.trimEnd)
      onUpdatePosition(clip.id, newStartTime)
    }

    const handleMouseUp = () => {
      setIsResizingLeft(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizingLeft, clip, resizeStartTrim, resizeStartPosition, pixelsPerSecond, onUpdateTrim, onUpdatePosition])

  // Handle right edge resize (trim end)
  useEffect(() => {
    if (!isResizingRight || !onUpdateTrim) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartPosition.x
      const deltaTime = deltaX / pixelsPerSecond

      // Calculate new trim end
      const newTrimEnd = Math.max(0, Math.min(clip.duration - clip.trimStart - 0.1, resizeStartTrim.end - deltaTime))

      onUpdateTrim(clip.id, clip.trimStart, newTrimEnd)
    }

    const handleMouseUp = () => {
      setIsResizingRight(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizingRight, clip, resizeStartTrim, resizeStartPosition, pixelsPerSecond, onUpdateTrim])

  return (
    <div
      className={`absolute top-1 bottom-1 rounded overflow-visible ${
        isSelected ? "ring-2 ring-pitch-perfect ring-offset-1 ring-offset-background" : ""
      } ${isDragging ? "cursor-grabbing opacity-70" : isResizingLeft || isResizingRight ? "cursor-ew-resize" : "cursor-grab"}`}
      style={{
        left,
        width,
        backgroundColor: isMuted ? "#27272a" : `${trackColor}20`,
        border: `1px solid ${isMuted ? "#3f3f46" : trackColor}`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Left resize handle */}
      <div
        className="resize-handle absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-pitch-perfect/70 transition-colors z-10 border-r border-pitch-perfect/30"
        onMouseDown={handleLeftEdgeMouseDown}
        title="Trim start"
      />

      {/* Right resize handle */}
      <div
        className="resize-handle absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-pitch-perfect/70 transition-colors z-10 border-l border-pitch-perfect/30"
        onMouseDown={handleRightEdgeMouseDown}
        title="Trim end"
      />

      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width, height: 80 }}
      />

      {/* Clip name */}
      <div className="absolute top-1 left-2 text-xs font-medium text-foreground/90 pointer-events-none truncate max-w-[calc(100%-1rem)]">
        {clip.name}
      </div>

      {/* Duration label */}
      <div className="absolute bottom-1 right-2 text-xs font-mono text-muted-foreground pointer-events-none">
        {formatDuration(visualDuration)}
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`
}
