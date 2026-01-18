"use client"

import { useState, useEffect, useCallback } from "react"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { PitchVisualizer } from "@/components/pitch-visualizer"
import { CircleVisualizer } from "@/components/circle-visualizer"
import { CurrentNoteDisplay } from "@/components/current-note-display"
import { RecordingControls } from "@/components/recording-controls"
import { AudioSettings } from "@/components/audio-settings"
import { SaveSessionDialog } from "@/components/save-session-dialog"
import { LayoutList, Circle, Mic, Square } from "lucide-react"
import { type PitchData } from "@/lib/pitch-detector"

export default function LiveRecordingPage() {
  const {
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
  } = useAudioRecorderContext()

  const [visualizationMode, setVisualizationMode] = useState<"timeline" | "circle">("timeline")
  const [isDesktop, setIsDesktop] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [recordedPitchHistory, setRecordedPitchHistory] = useState<PitchData[]>([])
  const [recordedDuration, setRecordedDuration] = useState(0)

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }

    checkScreenSize()
    window.addEventListener("resize", checkScreenSize)

    return () => window.removeEventListener("resize", checkScreenSize)
  }, [])

  // Track page view
  useEffect(() => {
    document.title = "Vocal Coach - Na zywo"
    trackPageView("Vocal Coach - Na zywo", "/record/live")
  }, [])

  // Wrap stop recording to show save dialog
  const handleStopRecording = useCallback(() => {
    // Save current pitch history and duration before stopping
    setRecordedPitchHistory([...pitchHistory])
    setRecordedDuration(Math.floor(recordingDuration / 1000))
    stopRecording()

    // Show save dialog if there's data to save
    if (pitchHistory.length > 0) {
      setShowSaveDialog(true)
    }
  }, [pitchHistory, recordingDuration, stopRecording])

  return (
    <div className="space-y-4 pb-24">
      {/* Mobile Layout */}
      {!isDesktop && (
        <>
          {/* Audio Settings */}
          <AudioSettings
            gain={gain}
            sensitivity={sensitivity}
            onGainChange={updateGain}
            onSensitivityChange={updateSensitivity}
            disabled={isRecording}
          />

          {/* Visualization Mode Toggle */}
          <div className="flex justify-center">
            <div className="inline-flex bg-secondary/50 rounded-full p-1 gap-1">
              <button
                onClick={() => {
                  setVisualizationMode("timeline")
                  trackEvent("visualization_changed", "Settings", "timeline")
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all ${
                  visualizationMode === "timeline"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutList className="w-4 h-4" />
                Timeline
              </button>
              <button
                onClick={() => {
                  setVisualizationMode("circle")
                  trackEvent("visualization_changed", "Settings", "circle")
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all ${
                  visualizationMode === "circle"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Circle className="w-4 h-4" />
                Kolo
              </button>
            </div>
          </div>

          {/* Live Pitch Visualizer */}
          <div
            className="rounded-3xl bg-card/80 backdrop-blur-sm border border-white/5 shadow-[0_8px_32px_-12px] shadow-black/30 p-4"
            style={{ minHeight: visualizationMode === "timeline" ? "280px" : undefined }}
          >
            {visualizationMode === "timeline" ? (
              <PitchVisualizer pitchHistory={pitchHistory} currentPitch={currentPitch} isRecording={isRecording} />
            ) : (
              <CircleVisualizer pitchHistory={pitchHistory} currentPitch={currentPitch} isRecording={isRecording} />
            )}
          </div>

          {/* Current Note Display - only show for timeline mode */}
          {visualizationMode === "timeline" && (
            <CurrentNoteDisplay currentPitch={currentPitch} pitchHistory={pitchHistory} />
          )}

          {/* Recording Controls */}
          <div className="rounded-3xl bg-card/80 backdrop-blur-sm border border-white/5 shadow-[0_8px_32px_-12px] shadow-black/30 p-6">
            <RecordingControls
              isRecording={isRecording}
              isPaused={isPaused}
              hasRecording={hasRecording}
              onStartRecording={startRecording}
              onStopRecording={handleStopRecording}
              onTogglePause={togglePause}
              onReset={reset}
              recordingDuration={recordingDuration}
            />
          </div>
        </>
      )}

      {/* Save Session Dialog */}
      <SaveSessionDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        pitchHistory={recordedPitchHistory}
        duration={recordedDuration}
        mode="live"
      />

      {/* Desktop Layout */}
      {isDesktop && (
        <div className="space-y-4">
          {/* Top bar: Audio Settings + Compact Controls */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <AudioSettings
                gain={gain}
                sensitivity={sensitivity}
                onGainChange={updateGain}
                onSensitivityChange={updateSensitivity}
                disabled={isRecording}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold tabular-nums text-foreground">
                {(() => {
                  const seconds = Math.floor(recordingDuration / 1000)
                  const minutes = Math.floor(seconds / 60)
                  const secs = seconds % 60
                  return `${minutes}:${secs.toString().padStart(2, "0")}`
                })()}
              </span>
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="w-14 h-14 rounded-full bg-gradient-to-b from-primary to-primary/80 shadow-lg hover:shadow-xl hover:translate-y-[-2px] active:scale-95 transition-all flex items-center justify-center text-primary-foreground"
                >
                  <Mic className="w-6 h-6" />
                </button>
              ) : (
                <button
                  onClick={handleStopRecording}
                  className="w-14 h-14 rounded-full bg-gradient-to-b from-destructive to-destructive/80 shadow-lg hover:shadow-xl hover:translate-y-[-2px] active:scale-95 transition-all flex items-center justify-center text-destructive-foreground"
                >
                  <Square className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>

          {/* MAIN: Piano Timeline - full width, tall */}
          <div className="rounded-2xl bg-card border border-border/50 p-4" style={{ height: "420px" }}>
            <PitchVisualizer
              pitchHistory={pitchHistory}
              currentPitch={currentPitch}
              isRecording={isRecording}
            />
          </div>

          {/* Bottom row: Circle + Current Note (compact) */}
          <div className="flex gap-4">
            <div className="rounded-2xl bg-card border border-border/50 p-4 shrink-0" style={{ width: "300px" }}>
              <CircleVisualizer
                pitchHistory={pitchHistory}
                currentPitch={currentPitch}
                isRecording={isRecording}
              />
            </div>
            <div className="flex-1">
              <CurrentNoteDisplay currentPitch={currentPitch} pitchHistory={pitchHistory} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
