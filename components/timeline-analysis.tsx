"use client"

import { useRef, useState, useMemo, useEffect } from "react"
import type { PitchData } from "@/lib/pitch-detector"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react"
import { Button } from "./ui/button"

interface TimelineAnalysisProps {
  pitchHistory: PitchData[]
}

// better spacing, and clearer labels

interface NoteSegment {
  note: string
  octave: number
  startTime: number
  endTime: number
  pitchData: PitchData[]
  avgCents: number
  accuracy: "perfect" | "good" | "off"
}

const ALL_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export function TimelineAnalysis({ pitchHistory }: TimelineAnalysisProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (timelineRef.current) {
        setContainerWidth(timelineRef.current.clientWidth)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Group pitches into segments with improved filtering
  const noteSegments = useMemo(() => {
    if (pitchHistory.length === 0) return []

    // Filter out unrealistic frequencies (keep only C2-C6 range for vocals)
    const realisticPitches = pitchHistory.filter(p => {
      const semitone = p.octave * 12 + ALL_NOTES.indexOf(p.note)
      return semitone >= 36 && semitone <= 84 // C2 to C6
    })

    if (realisticPitches.length === 0) return []

    const segments: NoteSegment[] = []
    let currentSegment: NoteSegment | null = null
    const gapThreshold = 300 // Increased for better grouping
    const minSegmentDuration = 80 // Minimum 80ms to count as a note

    const finalizeSegment = (segment: NoteSegment) => {
      // Only count segments that lasted long enough
      const duration = segment.endTime - segment.startTime
      if (duration < minSegmentDuration && segment.pitchData.length < 3) {
        return // Skip tiny segments
      }
      
      const avgCents =
        segment.pitchData.reduce((sum, p) => sum + Math.abs(p.cents), 0) / segment.pitchData.length
      segment.avgCents = avgCents
      segment.accuracy = avgCents <= 10 ? "perfect" : avgCents <= 25 ? "good" : "off"
      segments.push(segment)
    }

    realisticPitches.forEach((pitch) => {
      const noteKey = `${pitch.note}${pitch.octave}`

      if (
        !currentSegment ||
        `${currentSegment.note}${currentSegment.octave}` !== noteKey ||
        pitch.timestamp - currentSegment.endTime > gapThreshold
      ) {
        if (currentSegment && currentSegment.pitchData.length > 0) {
          finalizeSegment(currentSegment)
        }
        currentSegment = {
          note: pitch.note,
          octave: pitch.octave,
          startTime: pitch.timestamp,
          endTime: pitch.timestamp,
          pitchData: [pitch],
          avgCents: 0,
          accuracy: "perfect",
        }
      } else {
        currentSegment.endTime = pitch.timestamp
        currentSegment.pitchData.push(pitch)
      }
    })

    if (currentSegment !== null) {
      finalizeSegment(currentSegment)
    }

    return segments
  }, [pitchHistory])

  // Calculate note range from data (filtered to realistic vocal range)
  const noteRange = useMemo(() => {
    if (pitchHistory.length === 0) return { min: 48, max: 72 } // C3 to C5

    let minSemitone = Number.POSITIVE_INFINITY
    let maxSemitone = Number.NEGATIVE_INFINITY

    pitchHistory.forEach((p) => {
      const semitone = p.octave * 12 + ALL_NOTES.indexOf(p.note)
      // Only consider realistic vocal range (C2 to C6)
      if (semitone >= 36 && semitone <= 84) {
        minSemitone = Math.min(minSemitone, semitone)
        maxSemitone = Math.max(maxSemitone, semitone)
      }
    })

    // If no valid pitches found, use default range
    if (minSemitone === Number.POSITIVE_INFINITY) {
      return { min: 48, max: 72 } // C3 to C5
    }

    // Add padding but stay within vocal range
    return {
      min: Math.max(36, minSemitone - 2), // C2 minimum
      max: Math.min(84, maxSemitone + 2), // C6 maximum
    }
  }, [pitchHistory])

  const totalNotes = noteRange.max - noteRange.min + 1
  const noteHeight = 24 // Slightly smaller for mobile
  const pianoWidth = 50 // Narrower for mobile

  const totalDuration =
    pitchHistory.length > 0 ? pitchHistory[pitchHistory.length - 1].timestamp - pitchHistory[0].timestamp : 0
  const pixelsPerMs = 0.12 * zoom
  const totalWidth = Math.max(totalDuration * pixelsPerMs + 100, 400)

  const scroll = (direction: "left" | "right") => {
    const container = timelineRef.current
    if (!container) return
    const scrollAmount = 200
    container.scrollBy({ left: direction === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" })
  }

  const fitAll = () => {
    if (totalDuration === 0 || containerWidth === 0) return
    // Calculate zoom needed to fit entire duration in container
    const requiredWidth = totalDuration * 0.12 + 100
    const fitZoom = (containerWidth / requiredWidth)
    setZoom(Math.max(0.1, Math.min(3, fitZoom)))
    // Scroll to start
    setTimeout(() => {
      if (timelineRef.current) {
        timelineRef.current.scrollTo({ left: 0, behavior: "smooth" })
      }
    }, 50)
  }

  // Stats
  const stats = {
    total: noteSegments.length,
    perfect: noteSegments.filter((s) => s.accuracy === "perfect").length,
    good: noteSegments.filter((s) => s.accuracy === "good").length,
    off: noteSegments.filter((s) => s.accuracy === "off").length,
  }
  const accuracyPercent = stats.total > 0 ? Math.round(((stats.perfect + stats.good * 0.5) / stats.total) * 100) : 0

  if (pitchHistory.length === 0) {
    return (
      <div className="bg-card rounded-xl p-8 text-center text-muted-foreground">
        <p className="text-lg">Nagraj piosenkę aby zobaczyć analizę</p>
      </div>
    )
  }

  const startTime = pitchHistory[0].timestamp

  // Convert semitone to note name
  const semitoneToNote = (semitone: number) => {
    const octave = Math.floor(semitone / 12)
    const noteIdx = semitone % 12
    return { note: ALL_NOTES[noteIdx], octave }
  }

  return (
    <div className="bg-card rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <h3 className="font-semibold text-base sm:text-lg">Piano Roll</h3>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setZoom((z) => Math.max(0.1, z - 0.25))}
            className="h-8 w-8 sm:h-9 sm:w-9"
          >
            <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
          <span className="text-[10px] sm:text-xs text-muted-foreground w-7 sm:w-8 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="h-8 w-8 sm:h-9 sm:w-9">
            <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={fitAll}
            className="h-8 w-8 sm:h-9 sm:w-9"
            title="Fit All"
          >
            <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
          <div className="w-px h-5 sm:h-6 bg-border mx-0.5 sm:mx-1" />
          <Button variant="ghost" size="icon" onClick={() => scroll("left")} className="h-8 w-8 sm:h-9 sm:w-9">
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => scroll("right")} className="h-8 w-8 sm:h-9 sm:w-9">
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </div>

      {/* Piano roll */}
      <div ref={containerRef} className="flex rounded-lg overflow-hidden border border-border bg-background max-h-[60vh] sm:max-h-[70vh]">
        {/* Piano keys - fixed */}
        <div className="flex-shrink-0 sticky left-0 z-10 relative" style={{ width: pianoWidth }}>
          {Array.from({ length: totalNotes }).map((_, i) => {
            const semitone = noteRange.max - i
            const { note, octave } = semitoneToNote(semitone)
            const isBlack = note.includes("#")

            return (
              <div
                key={semitone}
                className="relative flex items-center justify-end pr-1"
                style={{
                  height: noteHeight,
                }}
              >
                {/* White key base */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: isBlack 
                      ? "linear-gradient(to right, oklch(0.15 0.01 270), oklch(0.18 0.01 270))"
                      : "linear-gradient(to right, oklch(0.92 0.01 270), oklch(0.88 0.01 270))",
                    borderBottom: "1px solid oklch(0.25 0.01 270)",
                    borderRight: isBlack ? "none" : "1px solid oklch(0.75 0.01 270)",
                  }}
                />
                
                {/* Black key overlay (shorter) */}
                {isBlack && (
                  <div
                    className="absolute right-0 top-0 bottom-0 z-10"
                    style={{
                      width: pianoWidth * 0.6,
                      background: "linear-gradient(to right, oklch(0.12 0.01 270), oklch(0.08 0.01 270))",
                      borderRight: "1px solid oklch(0.05 0.01 270)",
                      boxShadow: "inset -1px 0 2px rgba(0,0,0,0.5)",
                    }}
                  />
                )}
                
                {/* Label */}
                <span 
                  className="relative z-20 text-[9px] sm:text-[10px] font-bold"
                  style={{
                    color: isBlack ? "oklch(0.65 0 0)" : "oklch(0.30 0 0)",
                    marginRight: isBlack ? "4px" : "8px",
                  }}
                >
                  {note}{octave}
                </span>
              </div>
            )
          })}
        </div>

        {/* Timeline - scrollable */}
        <div ref={timelineRef} className="overflow-x-auto overflow-y-hidden flex-1" style={{ scrollbarWidth: "thin" }}>
          <div className="relative" style={{ width: totalWidth, height: totalNotes * noteHeight }}>
            {/* Grid lanes */}
            {Array.from({ length: totalNotes }).map((_, i) => {
              const semitone = noteRange.max - i
              const { note } = semitoneToNote(semitone)
              const isBlack = note.includes("#")

              return (
                <div
                  key={semitone}
                  className="absolute left-0 right-0 border-b border-border/30"
                  style={{
                    top: i * noteHeight,
                    height: noteHeight,
                    backgroundColor: isBlack ? "oklch(0.11 0.01 270)" : "oklch(0.14 0.01 270)",
                  }}
                />
              )
            })}

            {/* Time markers */}
            {Array.from({ length: Math.ceil(totalDuration / 1000) + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l border-border/40"
                style={{ left: i * 1000 * pixelsPerMs }}
              >
                <span className="absolute bottom-0.5 left-0.5 sm:bottom-1 sm:left-1 text-[9px] sm:text-[10px] text-muted-foreground">{i}s</span>
              </div>
            ))}

            {/* Note segments */}
            {noteSegments.map((segment, idx) => {
              const semitone = segment.octave * 12 + ALL_NOTES.indexOf(segment.note)
              const row = noteRange.max - semitone
              const x = (segment.startTime - startTime) * pixelsPerMs
              const width = Math.max((segment.endTime - segment.startTime) * pixelsPerMs, 16)

              const bgColor =
                segment.accuracy === "perfect"
                  ? "oklch(0.75 0.14 50)"
                  : segment.accuracy === "good"
                    ? "oklch(0.70 0.13 45)"
                    : "oklch(0.65 0.12 35)"

              return (
                <div
                  key={idx}
                  className="absolute rounded-sm sm:rounded-md shadow-md sm:shadow-lg"
                  style={{
                    left: x,
                    top: row * noteHeight + 2,
                    width: width,
                    height: noteHeight - 4,
                    backgroundColor: bgColor,
                    border: `1.5px solid ${bgColor.replace(/0\.\d+\)$/, "0.9)")}`,
                  }}
                >
                  {/* Note label inside block */}
                  {width > 25 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white/90">
                      {segment.note}
                      {segment.octave}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stats - responsive grid */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
        <div className="bg-secondary rounded-lg p-2 sm:p-3">
          <div className="text-lg sm:text-2xl font-bold text-primary">{accuracyPercent}%</div>
          <div className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Dokładność</div>
        </div>
        <div className="rounded-lg p-2 sm:p-3" style={{ backgroundColor: "oklch(0.75 0.14 50 / 0.15)" }}>
          <div className="text-lg sm:text-2xl font-bold" style={{ color: "oklch(0.75 0.14 50)" }}>
            {stats.perfect}
          </div>
          <div className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Idealnych</div>
        </div>
        <div className="rounded-lg p-2 sm:p-3" style={{ backgroundColor: "oklch(0.70 0.13 45 / 0.15)" }}>
          <div className="text-lg sm:text-2xl font-bold" style={{ color: "oklch(0.70 0.13 45)" }}>
            {stats.good}
          </div>
          <div className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Blisko</div>
        </div>
        <div className="rounded-lg p-2 sm:p-3" style={{ backgroundColor: "oklch(0.65 0.12 35 / 0.15)" }}>
          <div className="text-lg sm:text-2xl font-bold" style={{ color: "oklch(0.65 0.12 35)" }}>
            {stats.off}
          </div>
          <div className="text-[9px] sm:text-xs text-muted-foreground leading-tight">Fałsz</div>
        </div>
      </div>

      {/* Legend - compact for mobile */}
      <div className="bg-card rounded-lg p-3 sm:p-4 border border-border">
        <h4 className="font-medium text-sm mb-2">Wskazówki</h4>
        <div className="space-y-1.5 text-[11px] sm:text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: "oklch(0.75 0.14 50)" }} />
            <span><strong className="text-foreground">Zielony</strong> - śpiewasz idealnie w tonacji (±10 centów)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: "oklch(0.70 0.13 45)" }} />
            <span><strong className="text-foreground">Żółtozielony</strong> - jesteś blisko, ale lekko odchylony (±25 centów)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: "oklch(0.65 0.12 35)" }} />
            <span><strong className="text-foreground">Czerwony</strong> - znaczące odchylenie od nuty ({">"}25 centów)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
