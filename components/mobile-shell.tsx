"use client"

import { type PitchData } from "@/lib/pitch-detector"
import { PitchVisualizer } from "@/components/pitch-visualizer"
import { CircleVisualizer } from "@/components/circle-visualizer"
import { CurrentNoteDisplay } from "@/components/current-note-display"
import { RecordingControls } from "@/components/recording-controls"
import { TimelineAnalysis } from "@/components/timeline-analysis"
import { AudioSettings } from "@/components/audio-settings"
import { TrainingHub } from "@/components/training-hub"
import { Music2, AlertCircle, LayoutList, Circle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface MobileShellProps {
  activeTab: "live" | "analysis" | "training" | "why"
  setActiveTab: (tab: "live" | "analysis" | "training" | "why") => void
  visualizationMode: "timeline" | "circle"
  setVisualizationMode: (mode: "timeline" | "circle") => void
  isRecording: boolean
  isPaused: boolean
  currentPitch: PitchData | null
  pitchHistory: PitchData[]
  recordingDuration: number
  error: string | null
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

export function MobileShell({
  activeTab,
  setActiveTab,
  visualizationMode,
  setVisualizationMode,
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
}: MobileShellProps) {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border">
        <div className="max-w-lg mx-auto">
          {/* Logo and Title */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-pitch-perfect flex items-center justify-center shadow-sm">
                <Music2 className="w-5 h-5 text-background" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-foreground">Vocal Coach</h1>
                <a
                  href="https://instagram.com/arvindspiewa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  @arvindspiewa
                </a>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="px-2 pb-2">
            <div className="flex bg-secondary/50 rounded-xl p-1 gap-1">
              <button
                onClick={() => setActiveTab("live")}
                className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "live"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Na żywo
              </button>
              <button
                onClick={() => setActiveTab("training")}
                className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "training"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Trenuj
              </button>
              <button
                onClick={() => setActiveTab("analysis")}
                className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "analysis"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Analiza
              </button>
              <button
                onClick={() => setActiveTab("why")}
                className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === "why"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Po co?
              </button>
            </div>
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
        ) : activeTab === "training" ? (
          <>
            {/* Training Hub */}
            <TrainingHub
              currentPitch={currentPitch}
              isRecordingActive={isRecording}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
            />
          </>
        ) : activeTab === "why" ? (
          <>
            {/* Why Section */}
            <div className="bg-card rounded-xl p-6 border border-border space-y-6">
              <h2 className="text-2xl font-bold">Po co?</h2>
              <p className="text-base leading-relaxed">
                Cześć, jestem Arvind i uważam, że znalezienie komfortu z własnym głosem - i czerpanie radości z wydawania z siebie dźwięków - są warte tego, żeby codziennie poswięcić chwilę na pracy nad głosem. Wkrótce dodam tu wyszukiwarkę nauczycieli śpiewu, bo warto. Poniżej krótka relacja z jedynej lekcji jaką w życiu wziąłem i którą doskonale wspominam.
              </p>
              <div className="aspect-video w-full">
                <iframe
                  className="w-full h-full rounded-lg"
                  src="https://www.youtube.com/embed/qu70CHn2mdU"
                  title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
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
                    <strong className="text-pitch-good">Żółtozielony</strong> - jesteś blisko, ale lekko odchylony (±25 centów)
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

      {/* Footer */}
      <footer className="bg-card border-t border-border px-4 py-6 mt-8">
        <div className="max-w-lg mx-auto">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-4">
              <a
                href="https://instagram.com/ajuneja"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                Instagram
              </a>
              <span className="text-muted-foreground">•</span>
              <a
                href="https://www.linkedin.com/in/arvindjuneja/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                LinkedIn
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Arvind Juneja. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Bottom safe area for mobile */}
      <div className="h-safe-area-inset-bottom" />
    </main>
  )
}
