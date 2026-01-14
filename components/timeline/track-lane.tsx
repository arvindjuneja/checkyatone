"use client"

import { AudioClip } from "./audio-clip"
import type { Track, AudioClip as AudioClipType, AudioSource } from "@/lib/multi-track-storage"

interface TrackLaneProps {
  track: Track
  pixelsPerSecond: number
  duration: number
  scrollX: number
  selectedClipIds: string[]
  clips: AudioClipType[]
  sources: Map<string, AudioSource>
  onSelectClip?: (clipId: string, addToSelection: boolean) => void
  onUpdateClipPosition?: (clipId: string, startTime: number) => void
  onUpdateClipTrim?: (clipId: string, trimStart: number, trimEnd: number) => void
}

export function TrackLane({
  track,
  pixelsPerSecond,
  duration,
  scrollX,
  selectedClipIds,
  clips,
  sources,
  onSelectClip,
  onUpdateClipPosition,
  onUpdateClipTrim,
}: TrackLaneProps) {
  const trackHeight = track.height || 100

  const isSoloActive = false // TODO: Get from parent
  const isAudible = !track.mute && (!isSoloActive || track.solo)

  return (
    <div
      className="relative border-b border-border/50"
      style={{
        height: trackHeight,
        minWidth: duration * pixelsPerSecond,
      }}
    >
      {/* Track background with grid lines */}
      <div className="absolute inset-0 bg-secondary/5">
        {/* Vertical grid lines every second */}
        {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-border/20"
            style={{ left: i * pixelsPerSecond - scrollX }}
          />
        ))}
      </div>

      {/* Audio clips */}
      {clips.map((clip) => {
        const source = sources.get(clip.audioSourceId)
        if (!source) return null

        return (
          <AudioClip
            key={clip.id}
            clip={clip}
            source={source}
            trackColor={track.color}
            pixelsPerSecond={pixelsPerSecond}
            isSelected={selectedClipIds.includes(clip.id)}
            isMuted={!isAudible}
            onSelect={onSelectClip}
            onUpdatePosition={onUpdateClipPosition}
            onUpdateTrim={onUpdateClipTrim}
          />
        )
      })}
    </div>
  )
}
