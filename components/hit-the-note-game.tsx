"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useHitTheNoteGame, type OctaveRange } from "@/hooks/use-hit-the-note-game"
import { Play, Volume2, SkipForward, Home, Heart, Trophy, Music } from "lucide-react"
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
              Trafiaj w losowe nuty tak szybko jak potrafisz
            </p>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border space-y-3">
          <h3 className="font-semibold text-sm">Jak grać:</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">1.</span>
              <span>Usłyszysz losową nutę - zapamiętaj ją</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">2.</span>
              <span>Zaśpiewaj/zanucić tę samą nutę</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">3.</span>
              <span>Trafienie = +10 punktów, następna nuta</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-off">4.</span>
              <span>Możesz pominąć nutę, ale stracisz życie</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-off">5.</span>
              <span>Gra kończy się po 3 błędach</span>
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

  // Playing Phase
  if (phase === "playing") {
    const successfulHits = attempts.filter(a => a.success).length
    const totalAttempts = attempts.length

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
        <div className="bg-card rounded-xl p-8 border border-border text-center space-y-4">
          <div className="text-sm text-muted-foreground">Hit this note:</div>
          <div className={`text-7xl font-bold font-mono transition-all ${
            isHittingNote ? "text-pitch-perfect scale-110" : "text-foreground"
          }`}>
            {currentNote?.note}{currentNote?.octave}
          </div>
          
          {/* Hit Progress Bar */}
          <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-pitch-perfect transition-all duration-150"
              style={{ width: `${hitProgress}%` }}
            />
          </div>

          {isHittingNote && (
            <div className="text-pitch-perfect font-semibold animate-pulse">
              Keep going! 🎯
            </div>
          )}
        </div>

        {/* Current Pitch Display */}
        {currentPitch && (
          <div className="bg-card rounded-xl p-4 border border-border text-center">
            <div className="text-xs text-muted-foreground mb-1">You're singing:</div>
            <div className="text-3xl font-mono font-bold">
              {currentPitch.note}{currentPitch.octave}
              <span className="text-lg text-muted-foreground ml-2">
                {currentPitch.cents > 0 ? "+" : ""}{currentPitch.cents}¢
              </span>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Streak:</span>
            <span className="font-bold text-pitch-perfect">{successfulHits}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-2">
            <span className="text-muted-foreground">Total notes:</span>
            <span className="font-bold">{totalAttempts}</span>
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
            {isPlayingNote ? "Playing..." : "Replay Note"}
          </Button>
          <Button
            onClick={skipNote}
            variant="outline"
            size="lg"
            className="gap-2 border-pitch-off text-pitch-off hover:bg-pitch-off/10"
          >
            <SkipForward className="w-5 h-5" />
            Skip (-1 ❤️)
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
            <h2 className="text-2xl font-bold mb-2">Game Over!</h2>
            <p className="text-sm text-muted-foreground">Nice try!</p>
          </div>
        </div>

        {/* Final Score */}
        <div className="bg-pitch-perfect/10 rounded-xl p-6 border border-pitch-perfect/30 text-center space-y-2">
          <div className="text-sm text-muted-foreground">Final Score</div>
          <div className="text-5xl font-bold text-pitch-perfect">{score}</div>
          <div className="text-sm text-muted-foreground">
            {successfulHits} notes hit
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-3">
          <h3 className="font-semibold text-sm">Statistics:</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Notes Hit:</span>
              <span className="font-bold text-pitch-perfect">{successfulHits}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Notes Missed:</span>
              <span className="font-bold text-pitch-off">{totalAttempts - successfulHits}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Accuracy:</span>
              <span className="font-bold">{accuracy}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Score:</span>
              <span className="font-bold text-pitch-perfect">{score}</span>
            </div>
          </div>
        </div>

        {/* Recent Notes */}
        {attempts.length > 0 && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="font-semibold text-sm mb-3">Last notes:</h3>
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
                    {attempt.success ? "✓ Hit" : "✗ Missed"}
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
            Play Again
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
            Exit
          </Button>
        </div>
      </div>
    )
  }

  return null
}

