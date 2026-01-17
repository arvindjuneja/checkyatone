// Automation utilities for keyframe-based parameter control

export type AutomationParameter = 'volume' | 'eqLow' | 'eqMid' | 'eqHigh' | 'pan'

export interface AutomationPoint {
  id: string
  time: number      // seconds on timeline
  value: number     // 0-1 normalized
  curve: 'linear' | 'smooth'
}

export interface AutomationLane {
  id: string
  trackId: string
  parameter: AutomationParameter
  points: AutomationPoint[]
  color: string
  visible: boolean
}

// Default colors for different automation parameters
export const AUTOMATION_COLORS: Record<AutomationParameter, string> = {
  volume: '#22c55e',   // green
  eqLow: '#f97316',    // orange
  eqMid: '#eab308',    // yellow
  eqHigh: '#3b82f6',   // blue
  pan: '#a855f7',      // purple
}

// Default value for each parameter (normalized 0-1)
export const AUTOMATION_DEFAULTS: Record<AutomationParameter, number> = {
  volume: 1,      // 100%
  eqLow: 0.5,     // 0 dB (center of -12 to +12 range)
  eqMid: 0.5,     // 0 dB
  eqHigh: 0.5,    // 0 dB
  pan: 0.5,       // center
}

// Display labels for parameters
export const AUTOMATION_LABELS: Record<AutomationParameter, string> = {
  volume: 'Volume',
  eqLow: 'EQ Low',
  eqMid: 'EQ Mid',
  eqHigh: 'EQ High',
  pan: 'Pan',
}

// Generate a unique ID for automation points
export function generatePointId(): string {
  return `point_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Generate a unique ID for automation lanes
export function generateLaneId(): string {
  return `lane_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Get the interpolated value at a specific time
 * Uses linear or smooth interpolation based on point curve type
 */
export function getValueAtTime(lane: AutomationLane, time: number): number {
  const { points } = lane

  if (points.length === 0) {
    return AUTOMATION_DEFAULTS[lane.parameter]
  }

  // Sort points by time
  const sortedPoints = [...points].sort((a, b) => a.time - b.time)

  // Before first point - use first point's value
  if (time <= sortedPoints[0].time) {
    return sortedPoints[0].value
  }

  // After last point - use last point's value
  if (time >= sortedPoints[sortedPoints.length - 1].time) {
    return sortedPoints[sortedPoints.length - 1].value
  }

  // Find the two points to interpolate between
  let p1: AutomationPoint | null = null
  let p2: AutomationPoint | null = null

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    if (time >= sortedPoints[i].time && time <= sortedPoints[i + 1].time) {
      p1 = sortedPoints[i]
      p2 = sortedPoints[i + 1]
      break
    }
  }

  if (!p1 || !p2) {
    return AUTOMATION_DEFAULTS[lane.parameter]
  }

  // Calculate interpolation factor (0-1)
  const t = (time - p1.time) / (p2.time - p1.time)

  // Apply interpolation based on curve type
  if (p1.curve === 'smooth') {
    // Smooth interpolation using smoothstep (ease in/out)
    const smoothT = smoothstep(t)
    return p1.value + (p2.value - p1.value) * smoothT
  } else {
    // Linear interpolation
    return p1.value + (p2.value - p1.value) * t
  }
}

/**
 * Smoothstep function for smooth interpolation
 * Creates ease-in-ease-out effect
 */
function smoothstep(t: number): number {
  // Clamp t to [0, 1]
  t = Math.max(0, Math.min(1, t))
  // Smoothstep formula: 3t² - 2t³
  return t * t * (3 - 2 * t)
}

/**
 * Convert normalized value (0-1) to actual parameter value
 */
export function denormalizeValue(parameter: AutomationParameter, normalizedValue: number): number {
  switch (parameter) {
    case 'volume':
      // 0-1 maps to 0-100%
      return normalizedValue
    case 'eqLow':
    case 'eqMid':
    case 'eqHigh':
      // 0-1 maps to -12 to +12 dB
      return (normalizedValue - 0.5) * 24
    case 'pan':
      // 0-1 maps to -1 to +1 (left to right)
      return (normalizedValue - 0.5) * 2
    default:
      return normalizedValue
  }
}

/**
 * Convert actual parameter value to normalized (0-1)
 */
export function normalizeValue(parameter: AutomationParameter, value: number): number {
  switch (parameter) {
    case 'volume':
      return Math.max(0, Math.min(1, value))
    case 'eqLow':
    case 'eqMid':
    case 'eqHigh':
      // -12 to +12 dB maps to 0-1
      return (value + 12) / 24
    case 'pan':
      // -1 to +1 maps to 0-1
      return (value + 1) / 2
    default:
      return value
  }
}

/**
 * Format value for display
 */
export function formatValue(parameter: AutomationParameter, normalizedValue: number): string {
  const value = denormalizeValue(parameter, normalizedValue)

  switch (parameter) {
    case 'volume':
      return `${Math.round(value * 100)}%`
    case 'eqLow':
    case 'eqMid':
    case 'eqHigh':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
    case 'pan':
      if (Math.abs(value) < 0.01) return 'C'
      return value < 0 ? `${Math.round(Math.abs(value) * 100)}L` : `${Math.round(value * 100)}R`
    default:
      return normalizedValue.toFixed(2)
  }
}

/**
 * Add a new point to an automation lane
 */
export function addPoint(
  lane: AutomationLane,
  time: number,
  value: number,
  curve: 'linear' | 'smooth' = 'smooth'
): AutomationLane {
  const newPoint: AutomationPoint = {
    id: generatePointId(),
    time,
    value: Math.max(0, Math.min(1, value)),
    curve,
  }

  return {
    ...lane,
    points: [...lane.points, newPoint].sort((a, b) => a.time - b.time),
  }
}

/**
 * Update a point in an automation lane
 */
export function updatePoint(
  lane: AutomationLane,
  pointId: string,
  updates: Partial<Omit<AutomationPoint, 'id'>>
): AutomationLane {
  return {
    ...lane,
    points: lane.points.map(point =>
      point.id === pointId
        ? {
            ...point,
            ...updates,
            value: updates.value !== undefined
              ? Math.max(0, Math.min(1, updates.value))
              : point.value,
          }
        : point
    ).sort((a, b) => a.time - b.time),
  }
}

/**
 * Remove a point from an automation lane
 */
export function removePoint(lane: AutomationLane, pointId: string): AutomationLane {
  return {
    ...lane,
    points: lane.points.filter(point => point.id !== pointId),
  }
}

/**
 * Create a new automation lane
 */
export function createAutomationLane(
  trackId: string,
  parameter: AutomationParameter,
  visible: boolean = true
): AutomationLane {
  return {
    id: generateLaneId(),
    trackId,
    parameter,
    points: [],
    color: AUTOMATION_COLORS[parameter],
    visible,
  }
}

/**
 * Generate points for a smooth curve between two values (for previewing)
 */
export function generateCurvePoints(
  lane: AutomationLane,
  startTime: number,
  endTime: number,
  resolution: number = 100
): { time: number; value: number }[] {
  const points: { time: number; value: number }[] = []
  const step = (endTime - startTime) / resolution

  for (let i = 0; i <= resolution; i++) {
    const time = startTime + i * step
    points.push({
      time,
      value: getValueAtTime(lane, time),
    })
  }

  return points
}

/**
 * Create a "duck" curve - common for podcast music ducking
 * Drops to a target level and returns to full
 */
export function createDuckCurve(
  startTime: number,
  duration: number,
  duckLevel: number = 0.3,
  fadeTime: number = 0.5
): AutomationPoint[] {
  return [
    {
      id: generatePointId(),
      time: startTime,
      value: 1,
      curve: 'smooth',
    },
    {
      id: generatePointId(),
      time: startTime + fadeTime,
      value: duckLevel,
      curve: 'smooth',
    },
    {
      id: generatePointId(),
      time: startTime + duration - fadeTime,
      value: duckLevel,
      curve: 'smooth',
    },
    {
      id: generatePointId(),
      time: startTime + duration,
      value: 1,
      curve: 'smooth',
    },
  ]
}
