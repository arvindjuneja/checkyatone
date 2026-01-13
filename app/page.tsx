"use client"

import { useState, useEffect } from "react"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView } from "@/lib/analytics"
import { PitchVisualizer } from "@/components/pitch-visualizer"
import { CircleVisualizer } from "@/components/circle-visualizer"
import { CurrentNoteDisplay } from "@/components/current-note-display"
import { RecordingControls } from "@/components/recording-controls"
import { AudioSettings } from "@/components/audio-settings"
import { LayoutList, Circle } from "lucide-react"

export default function LivePage() {
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
    document.title = "Vocal Coach - Na żywo"
    trackPageView("Vocal Coach - Na żywo", "/")
  }, [])

  return (
    <div className="space-y-4">
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
            <div className="inline-flex bg-secondary/50 rounded-xl p-1 gap-1">
              <button
                onClick={() => setVisualizationMode("timeline")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  visualizationMode === "timeline"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutList className="w-4 h-4" />
                Timeline
              </button>
              <button
                onClick={() => setVisualizationMode("circle")}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  visualizationMode === "circle"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Circle className="w-4 h-4" />
                Koło
              </button>
            </div>
          </div>

          {/* Live Pitch Visualizer */}
          <div className="bg-card rounded-xl p-3 border border-border">
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
          <div className="bg-card rounded-xl p-6 border border-border">
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
        </>
      )}

      {/* Desktop Layout */}
      {isDesktop && (
        <div className="space-y-6 max-w-5xl mx-auto">
          {/* Timeline Visualizer */}
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="mb-3 text-sm font-semibold text-muted-foreground">Timeline</div>
            <div className="h-[320px]">
              <PitchVisualizer
                pitchHistory={pitchHistory}
                currentPitch={currentPitch}
                isRecording={isRecording}
              />
            </div>
          </div>
          {/* Circle Visualizer */}
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="mb-3 text-sm font-semibold text-muted-foreground">Koło</div>
            <div className="flex justify-center">
              <CircleVisualizer
                pitchHistory={pitchHistory}
                currentPitch={currentPitch}
                isRecording={isRecording}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
