"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX, Headphones, Trash2, GripVertical, ChevronDown, ChevronUp, Activity } from "lucide-react"
import type { Track, AutomationLane } from "@/lib/multi-track-storage"
import { AUTOMATION_LABELS, AUTOMATION_COLORS, type AutomationParameter } from "@/lib/automation"

interface TrackControlsProps {
  track: Track
  onUpdateTrack: (trackId: string, updates: Partial<Track>) => void
  onDeleteTrack: (trackId: string) => void
  onPlayTrack: (trackId: string) => void
  isPlaying: boolean
  isSoloActive: boolean // Whether any track has solo enabled
  automationLanes?: AutomationLane[]
  onCreateAutomationLane?: (trackId: string, parameter: AutomationParameter) => void
  onToggleAutomationLane?: (laneId: string, visible: boolean) => void
}

const AUTOMATION_PARAMS: AutomationParameter[] = ['volume', 'eqMid', 'pan']

export function TrackControls({
  track,
  onUpdateTrack,
  onDeleteTrack,
  onPlayTrack,
  isPlaying,
  isSoloActive,
  automationLanes = [],
  onCreateAutomationLane,
  onToggleAutomationLane,
}: TrackControlsProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [showAutomation, setShowAutomation] = useState(false)

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseFloat(e.target.value)
    onUpdateTrack(track.id, { volume })
  }

  const handlePanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pan = parseFloat(e.target.value)
    onUpdateTrack(track.id, { pan })
  }

  const toggleMute = () => {
    onUpdateTrack(track.id, { mute: !track.mute })
  }

  const toggleSolo = () => {
    onUpdateTrack(track.id, { solo: !track.solo })
  }

  // Track is audible if not muted AND (solo is off OR this track is soloed)
  const isAudible = !track.mute && (!isSoloActive || track.solo)

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Track Header */}
      <div className="flex items-center gap-2 p-3 bg-card/50">
        {/* Drag Handle */}
        <div className="cursor-move text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Track Color */}
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: track.color }}
        />

        {/* Track Name */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{track.name}</div>
          <div className="text-xs text-muted-foreground">
            {isAudible ? (
              <>Vol: {Math.round(track.volume * 100)}%</>
            ) : (
              <span className="text-muted-foreground/50">Muted</span>
            )}
          </div>
        </div>

        {/* Quick Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant={track.mute ? "default" : "ghost"}
            size="icon-sm"
            onClick={toggleMute}
            title={track.mute ? "Unmute" : "Mute"}
            className={track.mute ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : ""}
          >
            {track.mute ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </Button>

          <Button
            variant={track.solo ? "default" : "ghost"}
            size="icon-sm"
            onClick={toggleSolo}
            title={track.solo ? "Unsolo" : "Solo"}
            className={track.solo ? "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30" : ""}
          >
            <Headphones className="w-3 h-3" />
          </Button>

          <Button
            variant={showAutomation ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setShowAutomation(!showAutomation)}
            title="Automation"
            className={showAutomation ? "bg-green-500/20 text-green-500 hover:bg-green-500/30" : ""}
          >
            <Activity className="w-3 h-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDeleteTrack(track.id)}
            title="Delete track"
            className="text-destructive hover:text-destructive hover:bg-destructive/20"
          >
            <Trash2 className="w-3 h-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowDetails(!showDetails)}
            title="Show details"
          >
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        </div>
      </div>

      {/* Automation Controls (Collapsible) */}
      {showAutomation && (
        <div className="p-3 border-t border-border/50 bg-secondary/20">
          <div className="text-xs font-medium text-muted-foreground mb-2">AUTOMATYKA</div>
          <div className="flex flex-wrap gap-2">
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
                    px-2 py-1 text-xs rounded-md border transition-colors
                    ${isActive
                      ? 'border-transparent text-white'
                      : lane
                        ? 'border-border text-muted-foreground hover:border-border/80'
                        : 'border-dashed border-border text-muted-foreground/50 hover:border-border/80 hover:text-muted-foreground'
                    }
                  `}
                  style={{
                    backgroundColor: isActive ? AUTOMATION_COLORS[param] : undefined,
                  }}
                  title={lane ? (isActive ? 'Hide lane' : 'Show lane') : 'Create lane'}
                >
                  {AUTOMATION_LABELS[param]}
                </button>
              )
            })}
          </div>
          {automationLanes.filter(l => l.visible).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Click timeline to add keyframes
            </p>
          )}
        </div>
      )}

      {/* Track Details (Collapsible) */}
      {showDetails && (
        <div className="p-4 pt-2 border-t border-border/50 space-y-3">
          {/* Volume Control */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Volume</label>
              <span className="text-xs font-mono">{Math.round(track.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={track.volume}
              onChange={handleVolumeChange}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer slider"
              disabled={track.mute}
            />
          </div>

          {/* Pan Control */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Pan</label>
              <span className="text-xs font-mono">
                {track.pan === 0
                  ? "Center"
                  : track.pan < 0
                  ? `${Math.abs(Math.round(track.pan * 100))}% L`
                  : `${Math.round(track.pan * 100)}% R`}
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={track.pan}
              onChange={handlePanChange}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer slider"
              disabled={track.mute}
            />
          </div>

          {/* Track Info */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border/50">
            <div>Created: {new Date(track.timestamp).toLocaleString()}</div>
            <div>Size: {(track.audioBlob.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
        </div>
      )}
    </div>
  )
}
