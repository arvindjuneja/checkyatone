"use client"

import { Music2, Mic, BookOpen, Gamepad2, Music, BarChart3, Library } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DesktopNavProps {
  activeTab: "live" | "analysis" | "training" | "why"
  onTabChange: (tab: "live" | "analysis" | "training" | "why") => void
  isRecording: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  trainingMode: "menu" | "exercises" | "game" | "singalong"
  onTrainingModeChange: (mode: "menu" | "exercises" | "game" | "singalong") => void
  onOpenLibrary: () => void
}

export function DesktopNav({
  activeTab,
  onTabChange,
  isRecording,
  onStartRecording,
  onStopRecording,
  trainingMode,
  onTrainingModeChange,
  onOpenLibrary,
}: DesktopNavProps) {
  return (
    <div className="h-full flex flex-col p-4 space-y-6 overflow-y-auto">
      {/* Quick Actions */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Szybkie akcje</h3>
        <Button
          onClick={isRecording ? onStopRecording : onStartRecording}
          variant={isRecording ? "destructive" : "default"}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Mic className="w-4 h-4" />
          {isRecording ? "Stop (R)" : "Start (R)"}
        </Button>
        <Button
          onClick={onOpenLibrary}
          variant="outline"
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Library className="w-4 h-4" />
          Biblioteka sesji
        </Button>
      </div>

      {/* Navigation */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nawigacja</h3>
        <button
          onClick={() => onTabChange("live")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeTab === "live"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Music2 className="w-4 h-4" />
          <span>Na żywo</span>
          <span className="ml-auto text-xs opacity-50">1</span>
        </button>
        <button
          onClick={() => onTabChange("training")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeTab === "training"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Trenuj</span>
          <span className="ml-auto text-xs opacity-50">2</span>
        </button>
        <button
          onClick={() => onTabChange("analysis")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeTab === "analysis"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analiza</span>
          <span className="ml-auto text-xs opacity-50">3</span>
        </button>
        <button
          onClick={() => onTabChange("why")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeTab === "why"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Music className="w-4 h-4" />
          <span>Po co?</span>
          <span className="ml-auto text-xs opacity-50">4</span>
        </button>
      </div>

      {/* Training Modes (when on Training tab) */}
      {activeTab === "training" && (
        <div className="space-y-2 pt-4 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tryb treningowy</h3>
          <button
            onClick={() => onTrainingModeChange("exercises")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              trainingMode === "exercises"
                ? "bg-pitch-good/20 text-pitch-good font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Ćwiczenia</span>
          </button>
          <button
            onClick={() => onTrainingModeChange("game")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              trainingMode === "game"
                ? "bg-pitch-good/20 text-pitch-good font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Hit the Note!</span>
          </button>
          <button
            onClick={() => onTrainingModeChange("singalong")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              trainingMode === "singalong"
                ? "bg-pitch-good/20 text-pitch-good font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Śpiewaj z piosenką</span>
          </button>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-auto pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Naciśnij <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">?</kbd> aby zobaczyć wszystkie skróty
        </p>
      </div>
    </div>
  )
}
