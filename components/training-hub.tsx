"use client"

import { useState } from "react"
import { TrainingMode } from "@/components/training-mode"
import { HitTheNoteGame } from "@/components/hit-the-note-game"
import { BookOpen, Gamepad2, ArrowLeft } from "lucide-react"
import { type PitchData } from "@/lib/pitch-detector"

interface TrainingHubProps {
  currentPitch: PitchData | null
  isRecordingActive: boolean
  onStartRecording: () => void
  onStopRecording: () => void
}

type TrainingMode = "menu" | "exercises" | "game"

export function TrainingHub({
  currentPitch,
  isRecordingActive,
  onStartRecording,
  onStopRecording,
}: TrainingHubProps) {
  const [mode, setMode] = useState<TrainingMode>("menu")

  if (mode === "exercises") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setMode("menu")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to menu
        </button>
        <TrainingMode
          currentPitch={currentPitch}
          isRecordingActive={isRecordingActive}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
        />
      </div>
    )
  }

  if (mode === "game") {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setMode("menu")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to menu
        </button>
        <HitTheNoteGame
          currentPitch={currentPitch}
          isRecordingActive={isRecordingActive}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
        />
      </div>
    )
  }

  // Main Menu
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl p-4 border border-border">
        <h2 className="text-xl font-bold mb-2">Tryb treningowy</h2>
        <p className="text-sm text-muted-foreground">
          Wybierz sposób na ćwiczenie słuchu i precyzji wokalnej
        </p>
      </div>

      <div className="grid gap-3">
        {/* Exercises Option */}
        <button
          onClick={() => setMode("exercises")}
          className="bg-card hover:bg-accent rounded-xl p-6 border border-border text-left transition-all hover:scale-[1.02]"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-pitch-perfect/20 flex items-center justify-center shrink-0">
              <BookOpen className="w-6 h-6 text-pitch-perfect" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Ćwiczenia</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Strukturalne ćwiczenia ze skalami, arpeggami i interwałami
              </p>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs px-2 py-1 bg-secondary rounded">Gamy</span>
                <span className="text-xs px-2 py-1 bg-secondary rounded">Arpeggia</span>
                <span className="text-xs px-2 py-1 bg-secondary rounded">Interwały</span>
              </div>
            </div>
          </div>
        </button>

        {/* Game Option */}
        <button
          onClick={() => setMode("game")}
          className="bg-card hover:bg-accent rounded-xl p-6 border border-border text-left transition-all hover:scale-[1.02]"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-pitch-good to-pitch-perfect flex items-center justify-center shrink-0">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">Hit the Note! 🎮</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Gra zręcznościowa - trafiaj w losowe nuty i zdobywaj punkty
              </p>
              <div className="flex flex-wrap gap-1">
                <span className="text-xs px-2 py-1 bg-gradient-to-r from-pitch-good/20 to-pitch-perfect/20 rounded">
                  3 życia
                </span>
                <span className="text-xs px-2 py-1 bg-gradient-to-r from-pitch-good/20 to-pitch-perfect/20 rounded">
                  Losowe nuty
                </span>
                <span className="text-xs px-2 py-1 bg-gradient-to-r from-pitch-good/20 to-pitch-perfect/20 rounded">
                  Scoring
                </span>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Tips */}
      <div className="bg-card rounded-xl p-4 border border-border">
        <h3 className="font-semibold text-sm mb-2">Wskazówka:</h3>
        <p className="text-sm text-muted-foreground">
          Zacznij od <strong>Ćwiczeń</strong> aby nauczyć się precyzyjnego śpiewania gam i interwałów, 
          a potem sprawdź się w <strong>Grze</strong> aby przetestować swoje umiejętności!
        </p>
      </div>
    </div>
  )
}

