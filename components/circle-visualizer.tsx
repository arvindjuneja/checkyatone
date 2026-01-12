"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { type PitchData, getPitchAccuracy } from "@/lib/pitch-detector"

interface CircleVisualizerProps {
  pitchHistory: PitchData[]
  currentPitch: PitchData | null
  isRecording: boolean
}

interface PitchStats {
  perfect: number
  close: number
  off: number
}

interface NoteActivity {
  intensity: number // 0-1, how strongly this note is active
  accuracy: "perfect" | "good" | "off"
  lastSeen: number
}

const NOTES = ["C", "D", "E", "F", "G", "A", "B"]

// Map all 12 semitones to 7 natural notes for display
function getNoteIndex(note: string): number {
  const naturalNote = note.replace("#", "")
  return NOTES.indexOf(naturalNote)
}

// Time window for recent pitches (ms)
const ACTIVITY_WINDOW = 500
const FADE_DURATION = 300

export function CircleVisualizer({ pitchHistory, currentPitch, isRecording }: CircleVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const [stats, setStats] = useState<PitchStats>({ perfect: 0, close: 0, off: 0 })
  const lastCountedTimestamp = useRef<number>(0)
  const noteActivitiesRef = useRef<Map<number, NoteActivity>>(new Map())

  // Calculate stats from pitch history
  useEffect(() => {
    if (!isRecording) {
      setStats({ perfect: 0, close: 0, off: 0 })
      lastCountedTimestamp.current = 0
      return
    }

    // Count new pitches only
    const newPitches = pitchHistory.filter(p => p.timestamp > lastCountedTimestamp.current)
    if (newPitches.length === 0) return

    const newStats = { ...stats }
    newPitches.forEach(pitch => {
      const accuracy = getPitchAccuracy(pitch.cents)
      if (accuracy === "perfect") newStats.perfect++
      else if (accuracy === "good") newStats.close++
      else newStats.off++
    })

    lastCountedTimestamp.current = newPitches[newPitches.length - 1].timestamp
    setStats(newStats)
  }, [pitchHistory, isRecording])

  // Reset stats when recording starts
  useEffect(() => {
    if (isRecording && pitchHistory.length === 0) {
      setStats({ perfect: 0, close: 0, off: 0 })
      lastCountedTimestamp.current = 0
      noteActivitiesRef.current.clear()
    }
  }, [isRecording, pitchHistory.length])

  // Update note activities based on recent pitches
  const updateNoteActivities = useCallback(() => {
    const now = Date.now()
    const activities = noteActivitiesRef.current

    // Get recent pitches within activity window
    const recentPitches = pitchHistory.filter(p => now - p.timestamp < ACTIVITY_WINDOW)
    
    // Add current pitch if available
    const allRecentPitches = currentPitch 
      ? [...recentPitches, { ...currentPitch, timestamp: now }]
      : recentPitches

    // Count occurrences and accuracy for each note
    const noteCounts = new Map<number, { count: number; accuracies: Array<"perfect" | "good" | "off">; lastTime: number }>()
    
    allRecentPitches.forEach(pitch => {
      const noteIdx = getNoteIndex(pitch.note)
      if (noteIdx === -1) return
      
      const existing = noteCounts.get(noteIdx) || { count: 0, accuracies: [], lastTime: 0 }
      existing.count++
      existing.accuracies.push(getPitchAccuracy(pitch.cents))
      existing.lastTime = Math.max(existing.lastTime, pitch.timestamp)
      noteCounts.set(noteIdx, existing)
    })

    // Calculate total for normalization
    const totalCount = Array.from(noteCounts.values()).reduce((sum, n) => sum + n.count, 0)

    // Update activities for active notes
    noteCounts.forEach((data, noteIdx) => {
      // Intensity based on proportion of recent pitches
      const intensity = Math.min(1, (data.count / Math.max(1, totalCount)) * 2)
      
      // Dominant accuracy
      const accuracyCounts = { perfect: 0, good: 0, off: 0 }
      data.accuracies.forEach(a => accuracyCounts[a]++)
      const dominantAccuracy = accuracyCounts.perfect >= accuracyCounts.good && accuracyCounts.perfect >= accuracyCounts.off
        ? "perfect"
        : accuracyCounts.good >= accuracyCounts.off
          ? "good"
          : "off"

      activities.set(noteIdx, {
        intensity,
        accuracy: dominantAccuracy,
        lastSeen: data.lastTime
      })
    })

    // Fade out old activities
    activities.forEach((activity, noteIdx) => {
      const timeSinceLastSeen = now - activity.lastSeen
      if (timeSinceLastSeen > FADE_DURATION) {
        activities.delete(noteIdx)
      } else if (timeSinceLastSeen > 0) {
        // Gradual fade
        const fadeProgress = timeSinceLastSeen / FADE_DURATION
        activity.intensity = activity.intensity * (1 - fadeProgress)
      }
    })
  }, [pitchHistory, currentPitch])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Update activities before drawing
    if (isRecording) {
      updateNoteActivities()
    }

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const centerX = width / 2
    const centerY = height / 2
    const radius = Math.min(width, height) / 2 - 30

    // Background
    ctx.fillStyle = "oklch(0.12 0.01 270)"
    ctx.fillRect(0, 0, width, height)

    const innerRadius = radius * 0.35
    const middleRadius = radius * 0.65
    const outerRadius = radius * 0.95

    // Draw segments for each note
    const segmentAngle = (2 * Math.PI) / 7
    const startOffset = -Math.PI / 2 - segmentAngle / 2 // Start from top, centered on C

    const activities = noteActivitiesRef.current

    // Get current note for indicator
    let currentNoteIdx = -1
    let currentAccuracy: "perfect" | "good" | "off" | null = null
    
    if (currentPitch && isRecording) {
      currentNoteIdx = getNoteIndex(currentPitch.note)
      currentAccuracy = getPitchAccuracy(currentPitch.cents)
    }

    // Draw note segments
    NOTES.forEach((note, idx) => {
      const startAngle = startOffset + idx * segmentAngle
      const endAngle = startAngle + segmentAngle
      const activity = activities.get(idx)
      const isActive = activity && activity.intensity > 0.05

      // Colors based on accuracy
      const getColor = (accuracy: "perfect" | "good" | "off", lightness: number, alpha: number = 1) => {
        const hues = { perfect: 145, good: 80, off: 25 }
        const chroma = 0.18
        return `oklch(${lightness} ${chroma} ${hues[accuracy]} / ${alpha})`
      }

      // Inner segment
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, middleRadius, startAngle, endAngle)
      ctx.closePath()

      if (isActive) {
        const intensity = activity.intensity
        ctx.fillStyle = getColor(activity.accuracy, 0.55 + intensity * 0.15, 0.7 + intensity * 0.3)
      } else {
        ctx.fillStyle = "oklch(0.18 0.01 270)"
      }
      ctx.fill()

      ctx.strokeStyle = "oklch(0.25 0.01 270)"
      ctx.lineWidth = 1
      ctx.stroke()

      // Outer segment
      ctx.beginPath()
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle)
      ctx.arc(centerX, centerY, middleRadius, endAngle, startAngle, true)
      ctx.closePath()

      if (isActive) {
        const intensity = activity.intensity
        ctx.fillStyle = getColor(activity.accuracy, 0.45 + intensity * 0.15, 0.6 + intensity * 0.4)
      } else {
        ctx.fillStyle = "oklch(0.22 0.01 270)"
      }
      ctx.fill()

      ctx.strokeStyle = "oklch(0.28 0.01 270)"
      ctx.lineWidth = 1
      ctx.stroke()
    })

    // Draw note labels outside the wheel
    ctx.font = "bold 16px Geist, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    NOTES.forEach((note, idx) => {
      const angle = startOffset + idx * segmentAngle + segmentAngle / 2
      const labelRadius = outerRadius + 20
      const x = centerX + Math.cos(angle) * labelRadius
      const y = centerY + Math.sin(angle) * labelRadius

      const activity = activities.get(idx)
      const isActive = activity && activity.intensity > 0.1
      
      if (isActive) {
        const colors = {
          perfect: "oklch(0.75 0.15 145)",
          good: "oklch(0.80 0.15 80)",
          off: "oklch(0.70 0.15 25)",
        }
        ctx.fillStyle = colors[activity.accuracy]
      } else {
        ctx.fillStyle = "oklch(0.55 0.02 270)"
      }
      
      ctx.fillText(note, x, y)
    })

    // Draw center circle
    ctx.beginPath()
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2)
    ctx.fillStyle = "oklch(0.08 0.01 270)"
    ctx.fill()
    ctx.strokeStyle = "oklch(0.30 0.01 270)"
    ctx.lineWidth = 2
    ctx.stroke()

    // Draw center text
    ctx.font = "bold 24px Geist, system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    if (!isRecording) {
      ctx.fillStyle = "oklch(0.50 0.02 270)"
      ctx.fillText("Start", centerX, centerY)
    } else if (currentPitch) {
      const colors = {
        perfect: "oklch(0.75 0.15 145)",
        good: "oklch(0.80 0.15 80)",
        off: "oklch(0.70 0.15 25)",
      }
      ctx.fillStyle = currentAccuracy ? colors[currentAccuracy] : "oklch(0.85 0.02 270)"
      ctx.fillText(`${currentPitch.note}${currentPitch.octave}`, centerX, centerY)
    } else {
      ctx.fillStyle = "oklch(0.40 0.02 270)"
      ctx.fillText("...", centerX, centerY)
    }

    // Draw position indicator (white dot) on the wheel for current pitch
    if (currentPitch && isRecording && currentNoteIdx >= 0) {
      const angle = startOffset + currentNoteIdx * segmentAngle + segmentAngle / 2
      const indicatorRadius = middleRadius - 15
      const x = centerX + Math.cos(angle) * indicatorRadius
      const y = centerY + Math.sin(angle) * indicatorRadius

      // Outer glow
      ctx.beginPath()
      ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fillStyle = "oklch(1.0 0 0 / 0.3)"
      ctx.fill()

      // Inner dot
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fillStyle = "oklch(1.0 0 0)"
      ctx.fill()
    }

  }, [currentPitch, isRecording, updateNoteActivities])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      draw() // Draw one more time to show "Start"
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

  const total = stats.perfect + stats.close + stats.off
  const accuracy = total > 0 ? Math.round((stats.perfect / total) * 100) : 0

  return (
    <div className="space-y-4">
      <canvas 
        ref={canvasRef} 
        className="w-full aspect-square rounded-xl" 
        style={{ maxHeight: "320px" }} 
      />
      
      {/* Stats display */}
      {isRecording && total > 0 && (
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-pitch-perfect">{accuracy}%</div>
            <div className="text-muted-foreground text-xs">Dokładność</div>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-pitch-perfect">{stats.perfect}</div>
              <div className="text-muted-foreground text-xs">Idealne</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-pitch-good">{stats.close}</div>
              <div className="text-muted-foreground text-xs">Blisko</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-pitch-off">{stats.off}</div>
              <div className="text-muted-foreground text-xs">Fałsz</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
