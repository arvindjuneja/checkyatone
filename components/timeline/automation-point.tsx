"use client"

import { useRef } from "react"
import type { AutomationPoint as AutomationPointType } from "@/lib/automation"

interface AutomationPointProps {
  point: AutomationPointType
  x: number
  y: number
  color: string
  isSelected?: boolean
  pixelsPerSecond: number
  laneHeight: number
  onSelect?: (pointId: string, addToSelection: boolean) => void
  onDragStart?: (pointId: string) => void
  onDrag?: (pointId: string, newTime: number, newValue: number) => void
  onDragEnd?: (pointId: string) => void
  onDelete?: (pointId: string) => void
  onCurveChange?: (pointId: string, curve: 'linear' | 'smooth') => void
}

export function AutomationPoint({
  point,
  x,
  y,
  color,
  isSelected = false,
  pixelsPerSecond,
  laneHeight,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onDelete,
  onCurveChange,
}: AutomationPointProps) {
  const dragDataRef = useRef<{
    startX: number
    startY: number
    startTime: number
    startValue: number
  } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Capture pointer for drag
    ;(e.target as Element).setPointerCapture(e.pointerId)

    onSelect?.(point.id, e.shiftKey)
    onDragStart?.(point.id)

    dragDataRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: point.time,
      startValue: point.value,
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragDataRef.current) return

    e.preventDefault()
    e.stopPropagation()

    const deltaX = e.clientX - dragDataRef.current.startX
    const deltaY = e.clientY - dragDataRef.current.startY

    const deltaTime = deltaX / pixelsPerSecond
    const deltaValue = -deltaY / laneHeight

    const newTime = Math.max(0, dragDataRef.current.startTime + deltaTime)
    const newValue = Math.max(0, Math.min(1, dragDataRef.current.startValue + deltaValue))

    onDrag?.(point.id, newTime, newValue)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragDataRef.current) return

    e.preventDefault()
    e.stopPropagation()

    ;(e.target as Element).releasePointerCapture(e.pointerId)

    onDragEnd?.(point.id)
    dragDataRef.current = null
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete?.(point.id)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onCurveChange?.(point.id, point.curve === 'linear' ? 'smooth' : 'linear')
  }

  return (
    <g className="automation-point" style={{ cursor: 'pointer' }}>
      {/* Hit area */}
      <circle
        cx={x}
        cy={y}
        r={14}
        fill="transparent"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{ touchAction: 'none' }}
      />

      {/* Selection glow */}
      {isSelected && (
        <circle
          cx={x}
          cy={y}
          r={9}
          fill="none"
          stroke={color}
          strokeWidth={2}
          opacity={0.5}
          pointerEvents="none"
        />
      )}

      {/* Point */}
      <circle
        cx={x}
        cy={y}
        r={6}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
        pointerEvents="none"
      />

      {/* Linear indicator */}
      {point.curve === 'linear' && (
        <rect
          x={x - 2}
          y={y - 2}
          width={4}
          height={4}
          fill="#fff"
          transform={`rotate(45 ${x} ${y})`}
          pointerEvents="none"
        />
      )}
    </g>
  )
}
