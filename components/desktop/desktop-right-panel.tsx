"use client"

import { type PitchData } from "@/lib/pitch-detector"
import { AudioSettings } from "@/components/audio-settings"
import { CurrentNoteDisplay } from "@/components/current-note-display"
import { RecordingControls } from "@/components/recording-controls"

interface DesktopRightPanelProps {
  activeTab: "live" | "analysis" | "training" | "why"
  visualizationMode: "timeline" | "circle"
  setVisualizationMode: (mode: "timeline" | "circle") => void
  isRecording: boolean
  isPaused: boolean
  currentPitch: PitchData | null
  pitchHistory: PitchData[]
  recordingDuration: number
  startRecording: () => void
  stopRecording: () => void
  togglePause: () => void
  reset: () => void
  hasRecording: boolean
  gain: number
  sensitivity: number
  updateGain: (value: number) => void
  updateSensitivity: (value: number) => void
}

export function DesktopRightPanel({
  activeTab,
  visualizationMode,
  setVisualizationMode,
  isRecording,
  isPaused,
  currentPitch,
  pitchHistory,
  recordingDuration,
  startRecording,
  stopRecording,
  togglePause,
  reset,
  hasRecording,
  gain,
  sensitivity,
  updateGain,
  updateSensitivity,
}: DesktopRightPanelProps) {
  return (
    <div className="h-full flex flex-col p-4 space-y-4 overflow-y-auto">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Inspector</h3>

      {/* Audio Settings (always visible) */}
      <AudioSettings
        gain={gain}
        sensitivity={sensitivity}
        onGainChange={updateGain}
        onSensitivityChange={updateSensitivity}
        disabled={isRecording}
      />

      {/* Live Tab - Show current note */}
      {activeTab === "live" && (
        <>
          {/* Current Note Display */}
          <CurrentNoteDisplay currentPitch={currentPitch} pitchHistory={pitchHistory} />

          {/* Recording Stats */}
          {isRecording && (
            <div className="bg-card rounded-xl p-3 border border-border">
              <h4 className="text-sm font-semibold mb-2">Statystyki</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Czas nagrania:</span>
                  <span className="font-mono">{Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, "0")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Próbek:</span>
                  <span className="font-mono">{pitchHistory.length}</span>
                </div>
                {currentPitch && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bieżąca nuta:</span>
                    <span className="font-mono font-bold">
                      {currentPitch.note}{currentPitch.octave}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Training Tab - Show tips */}
      {activeTab === "training" && (
        <div className="bg-card rounded-xl p-3 border border-border">
          <h4 className="text-sm font-semibold mb-2">Wskazówki</h4>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">•</span>
              <span>Najpierw posłuchaj wzorca</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">•</span>
              <span>Śpiewaj każdą nutę wyraźnie</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">•</span>
              <span>Możesz powtórzyć tyle razy ile potrzebujesz</span>
            </li>
          </ul>
        </div>
      )}

      {/* Analysis Tab - Show legend */}
      {activeTab === "analysis" && (
        <div className="bg-card rounded-xl p-3 border border-border">
          <h4 className="text-sm font-semibold mb-2">Legenda kolorów</h4>
          <ul className="text-xs space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pitch-perfect" />
              <span className="text-pitch-perfect font-semibold">Idealnie</span>
              <span className="text-muted-foreground ml-auto">±10¢</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pitch-good" />
              <span className="text-pitch-good font-semibold">Dobrze</span>
              <span className="text-muted-foreground ml-auto">±25¢</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pitch-off" />
              <span className="text-pitch-off font-semibold">Do poprawy</span>
              <span className="text-muted-foreground ml-auto">{">"}25¢</span>
            </li>
          </ul>
        </div>
      )}

      {/* Recording Controls (always at bottom) */}
      <div className="mt-auto bg-card rounded-xl p-4 border border-border">
        <RecordingControls
          isRecording={isRecording}
          isPaused={isPaused}
          hasRecording={hasRecording}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onTogglePause={togglePause}
          onReset={reset}
          recordingDuration={recordingDuration}
        />
      </div>
    </div>
  )
}
