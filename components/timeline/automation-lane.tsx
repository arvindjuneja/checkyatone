"use client"

import { useState, useRef, useMemo, useCallback } from "react"
import { AutomationPoint } from "./automation-point"
import type { AutomationLane as AutomationLaneType } from "@/lib/automation"
import { generateCurvePoints, formatValue, AUTOMATION_LABELS } from "@/lib/automation"

interface AutomationLaneProps {
  lane: AutomationLaneType
  pixelsPerSecond: number
  duration: number
  height?: number
  scrollX?: number
  selectedPointIds?: string[]
  onSelectPoint?: (pointId: string, addToSelection: boolean) => void
  onAddPoint?: (laneId: string, time: number, value: number) => void
  onMovePoint?: (laneId: string, pointId: string, time: number, value: number) => void
  onDeletePoint?: (laneId: string, pointId: string) => void
  onCurveChange?: (laneId: string, pointId: string, curve: 'linear' | 'smooth') => void
}

export function AutomationLane({
  lane,
  pixelsPerSecond,
  duration,
  height = 60,
  scrollX = 0,
  selectedPointIds = [],
  onSelectPoint,
  onAddPoint,
  onMovePoint,
  onDeletePoint,
  onCurveChange,
}: AutomationLaneProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredValue, setHoveredValue] = useState<{ time: number; value: number } | null>(null)
  const [isDraggingPoint, setIsDraggingPoint] = useState(false)

  const totalWidth = duration * pixelsPerSecond

  // Generate curve path
  const curvePath = useMemo(() => {
    if (lane.points.length === 0) {
      const defaultY = height * 0.5
      return `M 0 ${defaultY} L ${totalWidth} ${defaultY}`
    }

    const curvePoints = generateCurvePoints(lane, 0, duration, Math.ceil(duration * 20))

    let path = ''
    curvePoints.forEach((point, index) => {
      const x = point.time * pixelsPerSecond
      const y = (1 - point.value) * height
      if (index === 0) {
        path += `M ${x} ${y}`
      } else {
        path += ` L ${x} ${y}`
      }
    })

    return path
  }, [lane, duration, pixelsPerSecond, height, totalWidth])

  // Add point on click (but not when dragging)
  const handleLaneClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Don't add point if we just finished dragging
    if (isDraggingPoint) return
    if (!svgRef.current) return

    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollX
    const y = e.clientY - rect.top

    const time = x / pixelsPerSecond
    const value = Math.max(0, Math.min(1, 1 - (y / height)))

    onAddPoint?.(lane.id, time, value)
  }, [lane.id, pixelsPerSecond, height, scrollX, onAddPoint, isDraggingPoint])

  // Hover preview
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return

    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollX
    const y = e.clientY - rect.top

    const time = x / pixelsPerSecond
    const value = 1 - (y / height)

    setHoveredValue({
      time: Math.max(0, time),
      value: Math.max(0, Math.min(1, value)),
    })
  }, [pixelsPerSecond, height, scrollX])

  const handleMouseLeave = useCallback(() => {
    setHoveredValue(null)
  }, [])

  // Point drag handlers
  const handlePointDragStart = useCallback(() => {
    setIsDraggingPoint(true)
  }, [])

  const handlePointDrag = useCallback((pointId: string, newTime: number, newValue: number) => {
    onMovePoint?.(lane.id, pointId, newTime, newValue)
  }, [lane.id, onMovePoint])

  const handlePointDragEnd = useCallback(() => {
    // Use setTimeout to prevent click from firing right after drag
    setTimeout(() => {
      setIsDraggingPoint(false)
    }, 100)
  }, [])

  const handlePointDelete = useCallback((pointId: string) => {
    onDeletePoint?.(lane.id, pointId)
  }, [lane.id, onDeletePoint])

  const handleCurveChange = useCallback((pointId: string, curve: 'linear' | 'smooth') => {
    onCurveChange?.(lane.id, pointId, curve)
  }, [lane.id, onCurveChange])

  if (!lane.visible) {
    return null
  }

  return (
    <div className="relative border-t border-border/30" style={{ height }}>
      {/* Lane label */}
      <div
        className="absolute left-0 top-0 z-10 px-2 py-0.5 text-[10px] font-medium rounded-br"
        style={{
          backgroundColor: `${lane.color}20`,
          color: lane.color,
        }}
      >
        {AUTOMATION_LABELS[lane.parameter]}
      </div>

      {/* Value scale */}
      <div className="absolute right-1 top-0 bottom-0 flex flex-col justify-between text-[8px] text-muted-foreground/50 pointer-events-none">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>

      {/* Hover indicator */}
      {hoveredValue && !isDraggingPoint && (
        <div
          className="absolute z-20 px-1.5 py-0.5 text-[10px] bg-background/90 border border-border rounded shadow-sm pointer-events-none"
          style={{
            left: hoveredValue.time * pixelsPerSecond - scrollX,
            top: (1 - hoveredValue.value) * height - 20,
          }}
        >
          {formatValue(lane.parameter, hoveredValue.value)}
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="absolute inset-0 cursor-crosshair"
        width={totalWidth}
        height={height}
        style={{ left: -scrollX }}
        onClick={handleLaneClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Grid */}
        <defs>
          <pattern id={`grid-${lane.id}`} width={pixelsPerSecond} height={height / 4} patternUnits="userSpaceOnUse">
            <path
              d={`M ${pixelsPerSecond} 0 L 0 0 0 ${height / 4}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-border/20"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${lane.id})`} />

        {/* Center line */}
        <line
          x1={0}
          y1={height * 0.5}
          x2={totalWidth}
          y2={height * 0.5}
          stroke={lane.color}
          strokeWidth={1}
          opacity={0.2}
          strokeDasharray="4 4"
        />

        {/* Filled area */}
        {lane.points.length > 0 && (
          <path
            d={`${curvePath} L ${totalWidth} ${height} L 0 ${height} Z`}
            fill={lane.color}
            opacity={0.1}
          />
        )}

        {/* Curve */}
        <path
          d={curvePath}
          fill="none"
          stroke={lane.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {lane.points.map((point) => (
          <AutomationPoint
            key={point.id}
            point={point}
            x={point.time * pixelsPerSecond}
            y={(1 - point.value) * height}
            color={lane.color}
            isSelected={selectedPointIds.includes(point.id)}
            pixelsPerSecond={pixelsPerSecond}
            laneHeight={height}
            onSelect={onSelectPoint}
            onDragStart={handlePointDragStart}
            onDrag={handlePointDrag}
            onDragEnd={handlePointDragEnd}
            onDelete={handlePointDelete}
            onCurveChange={handleCurveChange}
          />
        ))}
      </svg>
    </div>
  )
}
