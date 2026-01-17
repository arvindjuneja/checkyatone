"use client"

import { useState } from "react"
import { AudioClip } from "./audio-clip"
import { AutomationLane } from "./automation-lane"
import type { Track, AudioClip as AudioClipType, AudioSource, AutomationLane as AutomationLaneType } from "@/lib/multi-track-storage"
import type { AutomationParameter } from "@/lib/automation"
import { AUTOMATION_LABELS, AUTOMATION_COLORS } from "@/lib/automation"
import { Activity, Volume2, VolumeX, Headphones, Trash2 } from "lucide-react"

const AUTOMATION_PARAMS: AutomationParameter[] = ['volume', 'eqMid', 'pan']

interface TrackLaneProps {
  track: Track
  pixelsPerSecond: number
  duration: number
  scrollX: number
  selectedClipIds: string[]
  clips: AudioClipType[]
  sources: Map<string, AudioSource>
  automationLanes?: AutomationLaneType[]
  selectedPointIds?: string[]
  isSoloActive?: boolean
  onSelectClip?: (clipId: string, addToSelection: boolean) => void
  onUpdateClipPosition?: (clipId: string, startTime: number) => void
  onUpdateClipTrim?: (clipId: string, trimStart: number, trimEnd: number) => void
  onSelectPoint?: (pointId: string, addToSelection: boolean) => void
  onAddAutomationPoint?: (laneId: string, time: number, value: number) => void
  onMoveAutomationPoint?: (laneId: string, pointId: string, time: number, value: number) => void
  onDeleteAutomationPoint?: (laneId: string, pointId: string) => void
  onAutomationCurveChange?: (laneId: string, pointId: string, curve: 'linear' | 'smooth') => void
  onCreateAutomationLane?: (trackId: string, parameter: AutomationParameter) => void
  onToggleAutomationLane?: (laneId: string, visible: boolean) => void
  onUpdateTrack?: (trackId: string, updates: Partial<Track>) => void
  onDeleteTrack?: (trackId: string) => void
}

export function TrackLane({
  track,
  pixelsPerSecond,
  duration,
  scrollX,
  selectedClipIds,
  clips,
  sources,
  automationLanes = [],
  selectedPointIds = [],
  isSoloActive = false,
  onSelectClip,
  onUpdateClipPosition,
  onUpdateClipTrim,
  onSelectPoint,
  onAddAutomationPoint,
  onMoveAutomationPoint,
  onDeleteAutomationPoint,
  onAutomationCurveChange,
  onCreateAutomationLane,
  onToggleAutomationLane,
  onUpdateTrack,
  onDeleteTrack,
}: TrackLaneProps) {
  const [showAutomationPanel, setShowAutomationPanel] = useState(false)

  const baseTrackHeight = track.height || 100
  const automationLaneHeight = 60
  const trackHeaderWidth = 160

  // Calculate total height including visible automation lanes
  const visibleLanes = automationLanes.filter(lane => lane.visible)
  const totalHeight = baseTrackHeight + (visibleLanes.length * automationLaneHeight)

  const isAudible = !track.mute && (!isSoloActive || track.solo)

  return (
    <div
      className="relative border-b border-border/50 flex"
      style={{ height: totalHeight }}
    >
      {/* Track Header (fixed left) */}
      <div
        className="flex-shrink-0 bg-card border-r border-border/50 z-10"
        style={{ width: trackHeaderWidth }}
      >
        {/* Main track info */}
        <div
          className="p-2 flex flex-col gap-1"
          style={{ height: baseTrackHeight }}
        >
          {/* Track name and color */}
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: track.color }}
            />
            <span className="text-xs font-medium truncate">{track.name}</span>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdateTrack?.(track.id, { mute: !track.mute })}
              className={`p-1 rounded text-[10px] ${
                track.mute
                  ? 'bg-red-500/20 text-red-500'
                  : 'hover:bg-secondary text-muted-foreground'
              }`}
              title={track.mute ? 'Unmute' : 'Mute'}
            >
              {track.mute ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
            </button>

            <button
              onClick={() => onUpdateTrack?.(track.id, { solo: !track.solo })}
              className={`p-1 rounded text-[10px] ${
                track.solo
                  ? 'bg-yellow-500/20 text-yellow-500'
                  : 'hover:bg-secondary text-muted-foreground'
              }`}
              title={track.solo ? 'Unsolo' : 'Solo'}
            >
              <Headphones className="w-3 h-3" />
            </button>

            <button
              onClick={() => setShowAutomationPanel(!showAutomationPanel)}
              className={`p-1 rounded text-[10px] ${
                showAutomationPanel || visibleLanes.length > 0
                  ? 'bg-green-500/20 text-green-500'
                  : 'hover:bg-secondary text-muted-foreground'
              }`}
              title="Automation"
            >
              <Activity className="w-3 h-3" />
            </button>

            <button
              onClick={() => onDeleteTrack?.(track.id)}
              className="p-1 rounded text-[10px] text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
              title="Delete track"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {/* Automation panel */}
          {showAutomationPanel && (
            <div className="mt-1 flex flex-wrap gap-1">
              {AUTOMATION_PARAMS.map((param) => {
                const lane = automationLanes.find(l => l.parameter === param)
                const isActive = lane?.visible

                return (
                  <button
                    key={param}
                    onClick={() => {
                      if (lane) {
                        onToggleAutomationLane?.(lane.id, !lane.visible)
                      } else {
                        onCreateAutomationLane?.(track.id, param)
                      }
                    }}
                    className={`
                      px-1.5 py-0.5 text-[9px] rounded border transition-colors
                      ${isActive
                        ? 'border-transparent text-white'
                        : lane
                          ? 'border-border text-muted-foreground hover:border-border/80'
                          : 'border-dashed border-border/50 text-muted-foreground/50 hover:border-border hover:text-muted-foreground'
                      }
                    `}
                    style={{
                      backgroundColor: isActive ? AUTOMATION_COLORS[param] : undefined,
                    }}
                  >
                    {AUTOMATION_LABELS[param]}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Automation lane headers */}
        {visibleLanes.map((lane) => (
          <div
            key={lane.id}
            className="px-2 py-1 text-[10px] border-t border-border/30 flex items-center gap-1"
            style={{
              height: automationLaneHeight,
              color: lane.color,
            }}
          >
            <span className="truncate">{AUTOMATION_LABELS[lane.parameter]}</span>
          </div>
        ))}
      </div>

      {/* Timeline content (scrollable) */}
      <div
        className="flex-1 relative"
        style={{ minWidth: duration * pixelsPerSecond }}
      >
        {/* Track background with grid lines */}
        <div className="absolute inset-0 bg-secondary/5" style={{ height: baseTrackHeight }}>
          {/* Vertical grid lines every second */}
          {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-border/20"
              style={{ left: i * pixelsPerSecond }}
            />
          ))}
        </div>

        {/* Audio clips */}
        <div style={{ height: baseTrackHeight, position: 'relative' }}>
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

        {/* Automation lanes */}
        {visibleLanes.map((lane) => (
          <AutomationLane
            key={lane.id}
            lane={lane}
            pixelsPerSecond={pixelsPerSecond}
            duration={duration}
            height={automationLaneHeight}
            scrollX={scrollX}
            selectedPointIds={selectedPointIds}
            onSelectPoint={onSelectPoint}
            onAddPoint={onAddAutomationPoint}
            onMovePoint={onMoveAutomationPoint}
            onDeletePoint={onDeleteAutomationPoint}
            onCurveChange={onAutomationCurveChange}
          />
        ))}
      </div>
    </div>
  )
}
