"use client"

import { useState } from "react"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { PitchVisualizer } from "@/components/pitch-visualizer"
import { CurrentNoteDisplay } from "@/components/current-note-display"
import { RecordingControls } from "@/components/recording-controls"
import { TimelineAnalysis } from "@/components/timeline-analysis"
import { AudioSettings } from "@/components/audio-settings"
import { TrainingMode } from "@/components/training-mode"
import { Music2, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function VocalAnalyzerPage() {
  const {
    isRecording,
    isPaused,
    currentPitch,
    pitchHistory,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    togglePause,
    reset,
    hasRecording,
    gain,
    sensitivity,
    updateGain,
    updateSensitivity,
  } = useAudioRecorder()

  const [activeTab, setActiveTab] = useState<"live" | "analysis" | "training">("live")

  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">VocalViz</h1>
              <p className="text-xs text-muted-foreground">Analiza wokalna</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-secondary rounded-lg p-1">
            <button
              onClick={() => setActiveTab("live")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "live" ? "bg-background text-foreground" : "text-muted-foreground"
              }`}
            >
              Na żywo
            </button>
            <button
              onClick={() => setActiveTab("training")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "training" ? "bg-background text-foreground" : "text-muted-foreground"
              }`}
            >
              Trenuj
            </button>
            <button
              onClick={() => setActiveTab("analysis")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === "analysis" ? "bg-background text-foreground" : "text-muted-foreground"
              }`}
            >
              Analiza
            </button>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="px-4 py-2 max-w-lg mx-auto w-full">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-4">
        {activeTab === "live" ? (
          <>
            {/* Audio Settings */}
            <AudioSettings
              gain={gain}
              sensitivity={sensitivity}
              onGainChange={updateGain}
              onSensitivityChange={updateSensitivity}
              disabled={isRecording}
            />

            {/* Live Pitch Visualizer */}
            <div className="bg-card rounded-xl p-3 border border-border">
              <PitchVisualizer pitchHistory={pitchHistory} currentPitch={currentPitch} isRecording={isRecording} />
            </div>

            {/* Current Note Display */}
            <CurrentNoteDisplay currentPitch={currentPitch} pitchHistory={pitchHistory} />

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
        ) : activeTab === "training" ? (
          <>
            {/* Training Mode */}
            <TrainingMode
              currentPitch={currentPitch}
              isRecordingActive={isRecording}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
            />
          </>
        ) : (
          <>
            {/* Timeline Analysis */}
            <TimelineAnalysis pitchHistory={pitchHistory} />

            {/* Tips */}
            <div className="bg-card rounded-xl p-4 border border-border space-y-3">
              <h3 className="font-semibold text-sm">Wskazówki</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-pitch-perfect mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-pitch-perfect">Zielony</strong> - śpiewasz idealnie w tonacji (±10 centów)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-pitch-good mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-pitch-good">Żółty</strong> - jesteś blisko, ale lekko odchylony (±25 centów)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-pitch-off mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-pitch-off">Czerwony</strong> - znaczące odchylenie od nuty ({">"}25 centów)
                  </span>
                </li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Bottom safe area for mobile */}
      <div className="h-safe-area-inset-bottom" />
    </main>
  )
}
