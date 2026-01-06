"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useHitTheNoteGame, type OctaveRange } from "@/hooks/use-hit-the-note-game"
import { Play, Volume2, SkipForward, Home, Heart, Music, ChevronUp, ChevronDown, Check } from "lucide-react"
import { type PitchData } from "@/lib/pitch-detector"

interface HitTheNoteGameProps {
  currentPitch: PitchData | null
  isRecordingActive: boolean
  onStartRecording: () => void
  onStopRecording: () => void
}

export function HitTheNoteGame({
  currentPitch,
  isRecordingActive,
  onStartRecording,
  onStopRecording,
}: HitTheNoteGameProps) {
  const [octaveRange, setOctaveRange] = useState<OctaveRange>("medium")
  
  const {
    phase,
    currentNote,
    score,
    lives,
    attempts,
    isPlayingNote,
    hitProgress,
    isHittingNote,
    pitchFeedback,
    startGame,
    playCurrentNote,
    processPitch,
    skipNote,
    reset,
  } = useHitTheNoteGame(octaveRange)

  // Process pitches when playing
  useEffect(() => {
    if (phase === "playing" && currentPitch && isRecordingActive) {
      processPitch(currentPitch)
    }
  }, [phase, currentPitch, isRecordingActive, processPitch])

  // Ready Phase - Game Start
  if (phase === "ready") {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Hit the Note!</h2>
            <p className="text-sm text-muted-foreground">
              Trafiaj w losowe nuty i utrzymuj je przez 3 sekundy
            </p>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border space-y-3">
          <h3 className="font-semibold text-sm">Jak grać:</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">1.</span>
              <span>Usłyszysz nutę - zapamiętaj ją</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">2.</span>
              <span>Zaśpiewaj tę nutę i <strong>utrzymaj przez ~3s</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">3.</span>
              <span>Strzałki ↑↓ pokażą czy śpiewasz za wysoko/nisko</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-off">4.</span>
              <span>Możesz pominąć nutę, ale stracisz życie</span>
            </li>
          </ul>
        </div>

        {/* Octave Range Selector */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Music className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Zakres oktaw</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOctaveRange("low")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                octaveRange === "low"
                  ? "bg-pitch-perfect text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Niski
            </button>
            <button
              onClick={() => setOctaveRange("medium")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                octaveRange === "medium"
                  ? "bg-pitch-good text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Średni
            </button>
            <button
              onClick={() => setOctaveRange("high")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                octaveRange === "high"
                  ? "bg-pitch-off text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Wysoki
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {octaveRange === "low" && "Tylko C3-B3 (najniższy zakres)"}
            {octaveRange === "medium" && "C3-B4 (wygodny zakres - domyślny)"}
            {octaveRange === "high" && "C3-B5 (pełny zakres, trudniejszy)"}
          </p>
        </div>

        <Button
          onClick={() => {
            startGame()
            onStartRecording()
          }}
          size="lg"
          className="w-full gap-2 h-14 text-lg bg-pitch-perfect hover:opacity-90 text-background"
        >
          <Play className="w-6 h-6" />
          Start Game
        </Button>
      </div>
    )
  }

  // Celebrating Phase - Note Hit! 🎉
  if (phase === "celebrating") {
    return (
      <div className="space-y-4">
        {/* Score and Lives Header */}
        <div className="flex justify-between items-center">
          <div className="bg-card rounded-xl px-4 py-2 border border-border">
            <div className="text-xs text-muted-foreground mb-1">Score</div>
            <div className="text-2xl font-bold text-pitch-perfect">{score}</div>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart
                key={i}
                className={`w-8 h-8 ${
                  i < lives
                    ? "fill-pitch-off text-pitch-off"
                    : "fill-muted text-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Celebration Display */}
        <div className="bg-gradient-to-br from-pitch-perfect/20 via-pitch-good/20 to-pitch-perfect/20 rounded-xl p-8 border-2 border-pitch-perfect text-center space-y-4 animate-pulse">
          <div className="text-6xl animate-bounce">🎉</div>
          <div className="text-5xl font-bold text-pitch-perfect">
            PERFECT!
          </div>
          <div className="text-2xl font-mono text-foreground">
            {currentNote?.note}{currentNote?.octave}
          </div>
          <div className="text-pitch-perfect font-semibold text-lg">
            +10 punktów!
          </div>
        </div>

        {/* Progress Bar - Full */}
        <div className="w-full h-4 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pitch-perfect to-pitch-good transition-all duration-300"
            style={{ width: "100%" }}
          />
        </div>
      </div>
    )
  }

  // Playing Phase
  if (phase === "playing") {
    const successfulHits = attempts.filter(a => a.success).length

    // Determine pitch indicator
    const getPitchIndicator = () => {
      if (!pitchFeedback || !currentPitch) return null
      
      const { direction, cents } = pitchFeedback
      
      if (direction === "perfect") {
        return (
          <div className="flex items-center justify-center gap-2 text-pitch-perfect">
            <Check className="w-6 h-6" />
            <span className="font-bold">Idealnie!</span>
          </div>
        )
      }
      
      if (direction === "sharp") {
        return (
          <div className="flex items-center justify-center gap-2 text-pitch-off">
            <ChevronUp className="w-8 h-8 animate-bounce" />
            <span className="font-bold">Za wysoko! ({cents > 0 ? "+" : ""}{cents}¢)</span>
          </div>
        )
      }
      
      if (direction === "flat") {
        return (
          <div className="flex items-center justify-center gap-2 text-amber-500">
            <ChevronDown className="w-8 h-8 animate-bounce" />
            <span className="font-bold">Za nisko! ({cents}¢)</span>
          </div>
        )
      }
      
      return null
    }

    return (
      <div className="space-y-4">
        {/* Score and Lives Header */}
        <div className="flex justify-between items-center">
          <div className="bg-card rounded-xl px-4 py-2 border border-border">
            <div className="text-xs text-muted-foreground mb-1">Score</div>
            <div className="text-2xl font-bold text-pitch-perfect">{score}</div>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Heart
                key={i}
                className={`w-8 h-8 ${
                  i < lives
                    ? "fill-pitch-off text-pitch-off"
                    : "fill-muted text-muted"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Current Note Display */}
        <div className={`bg-card rounded-xl p-6 border-2 text-center space-y-3 transition-all ${
          isHittingNote ? "border-pitch-perfect bg-pitch-perfect/5" : "border-border"
        }`}>
          <div className="text-sm text-muted-foreground">Zaśpiewaj i utrzymaj:</div>
          <div className={`text-7xl font-bold font-mono transition-all ${
            isHittingNote ? "text-pitch-perfect scale-110" : "text-foreground"
          }`}>
            {currentNote?.note}{currentNote?.octave}
          </div>
          
          {/* Hit Progress Bar */}
          <div className="relative w-full h-4 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                hitProgress > 80 ? "bg-gradient-to-r from-pitch-perfect to-pitch-good" :
                hitProgress > 40 ? "bg-pitch-good" :
                "bg-pitch-perfect"
              }`}
              style={{ width: `${hitProgress}%` }}
            />
            {/* Progress markers */}
            <div className="absolute inset-0 flex justify-between px-1 items-center pointer-events-none">
              {[25, 50, 75].map(mark => (
                <div key={mark} className="w-0.5 h-2 bg-background/30" style={{ marginLeft: `${mark}%` }} />
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {hitProgress < 10 ? "Zacznij śpiewać..." : 
             hitProgress < 50 ? "Utrzymaj nutę..." :
             hitProgress < 80 ? "Świetnie! Jeszcze chwilę..." :
             "Prawie! 🔥"}
          </div>
        </div>

        {/* User's Current Pitch with Direction Indicator */}
        <div className="bg-card rounded-xl p-4 border border-border">
          {currentPitch ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Śpiewasz:</span>
                <span className="text-2xl font-mono font-bold">
                  {currentPitch.note}{currentPitch.octave}
                </span>
              </div>
              
              {/* Pitch Direction Indicator */}
              <div className="h-10 flex items-center justify-center">
                {getPitchIndicator()}
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              <div className="text-lg mb-1">🎤</div>
              <div className="text-sm">Oczekiwanie na dźwięk...</div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="bg-card rounded-xl p-3 border border-border">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Trafione nuty:</span>
            <span className="font-bold text-pitch-perfect">{successfulHits}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={playCurrentNote}
            disabled={isPlayingNote}
            variant="secondary"
            size="lg"
            className="flex-1 gap-2"
          >
            <Volume2 className={`w-5 h-5 ${isPlayingNote ? "animate-pulse" : ""}`} />
            {isPlayingNote ? "Gram..." : "Powtórz nutę"}
          </Button>
          <Button
            onClick={skipNote}
            variant="outline"
            size="lg"
            className="gap-2 border-pitch-off text-pitch-off hover:bg-pitch-off/10"
          >
            <SkipForward className="w-5 h-5" />
            Pomiń
          </Button>
        </div>
      </div>
    )
  }

  // Game Over Phase
  if (phase === "gameover") {
    const successfulHits = attempts.filter(a => a.success).length
    const totalAttempts = attempts.length
    const accuracy = totalAttempts > 0 ? Math.round((successfulHits / totalAttempts) * 100) : 0

    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div className="text-6xl">🎮</div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Koniec gry!</h2>
            <p className="text-sm text-muted-foreground">Świetna próba!</p>
          </div>
        </div>

        {/* Final Score */}
        <div className="bg-pitch-perfect/10 rounded-xl p-6 border border-pitch-perfect/30 text-center space-y-2">
          <div className="text-sm text-muted-foreground">Końcowy wynik</div>
          <div className="text-5xl font-bold text-pitch-perfect">{score}</div>
          <div className="text-sm text-muted-foreground">
            {successfulHits} {successfulHits === 1 ? "nuta trafiona" : "nut trafionych"}
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-3">
          <h3 className="font-semibold text-sm">Statystyki:</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Trafione:</span>
              <span className="font-bold text-pitch-perfect">{successfulHits}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Pominięte:</span>
              <span className="font-bold text-pitch-off">{totalAttempts - successfulHits}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Celność:</span>
              <span className="font-bold">{accuracy}%</span>
            </div>
          </div>
        </div>

        {/* Recent Notes */}
        {attempts.length > 0 && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="font-semibold text-sm mb-3">Ostatnie nuty:</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {attempts.slice(-5).reverse().map((attempt, idx) => (
                <div
                  key={idx}
                  className={`flex justify-between items-center p-2 rounded text-sm ${
                    attempt.success ? "bg-pitch-perfect/20" : "bg-pitch-off/20"
                  }`}
                >
                  <span className="font-mono font-semibold">
                    {attempt.targetNote.note}{attempt.targetNote.octave}
                  </span>
                  <span>
                    {attempt.success ? "✓ Trafione" : "✗ Pominięte"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={() => {
              startGame()
              if (!isRecordingActive) {
                onStartRecording()
              }
            }}
            size="lg"
            className="flex-1 gap-2 bg-pitch-perfect text-background hover:opacity-90"
          >
            <Play className="w-5 h-5" />
            Zagraj ponownie
          </Button>
          <Button
            onClick={() => {
              reset()
              if (isRecordingActive) {
                onStopRecording()
              }
            }}
            size="lg"
            variant="secondary"
            className="gap-2"
          >
            <Home className="w-5 h-5" />
            Wyjdź
          </Button>
        </div>
      </div>
    )
  }

  return null
}
