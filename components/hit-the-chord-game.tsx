"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useHitTheChordGame, type Difficulty } from "@/hooks/use-hit-the-chord-game"
import { Play, Volume2, SkipForward, Home, Heart, Music, Guitar } from "lucide-react"
import { type PitchData } from "@/lib/pitch-detector"
import { type GuitarChord } from "@/lib/guitar"

interface HitTheChordGameProps {
  currentPitch: PitchData | null
  isRecordingActive: boolean
  onStartRecording: () => void
  onStopRecording: () => void
}

// Simple chord diagram component
function ChordDiagram({ chord }: { chord: GuitarChord }) {
  const frets = chord.frets
  const maxFret = Math.max(...frets.filter((f): f is number => f !== null), 3)
  const minFret = Math.min(...frets.filter((f): f is number => f !== null && f > 0), 1)
  const startFret = minFret > 1 ? minFret : 1
  const numFrets = Math.max(4, maxFret - startFret + 2)

  return (
    <div className="flex flex-col items-center">
      {/* Chord name */}
      <div className="text-4xl font-bold mb-4">{chord.displayName}</div>

      {/* Fretboard diagram */}
      <div className="relative bg-amber-900/30 rounded p-2">
        {/* Nut (if starting at fret 1) */}
        {startFret === 1 && (
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-foreground/60 rounded-l" />
        )}

        {/* Fret position indicator if not at nut */}
        {startFret > 1 && (
          <div className="absolute -left-6 top-4 text-xs text-muted-foreground">
            {startFret}fr
          </div>
        )}

        <div className="flex gap-1.5 pl-2">
          {/* Strings (6 to 1, low to high) */}
          {frets.map((fret, stringIdx) => (
            <div key={stringIdx} className="flex flex-col items-center gap-0.5">
              {/* X or O above nut */}
              <div className="h-5 flex items-center justify-center text-sm font-bold">
                {fret === null ? "×" : fret === 0 ? "○" : ""}
              </div>

              {/* Fret positions */}
              {Array.from({ length: numFrets }).map((_, fretIdx) => {
                const actualFret = startFret + fretIdx
                const hasFinger = fret === actualFret

                return (
                  <div
                    key={fretIdx}
                    className={`w-6 h-6 border-b border-r border-foreground/30 flex items-center justify-center ${
                      fretIdx === 0 ? "border-t" : ""
                    }`}
                  >
                    {/* String line */}
                    <div className="absolute w-0.5 h-full bg-foreground/40" />

                    {/* Finger dot */}
                    {hasFinger && (
                      <div className="w-4 h-4 rounded-full bg-primary z-10" />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Barre indicator */}
        {chord.barreAt && (
          <div
            className="absolute h-1.5 bg-primary/80 rounded-full"
            style={{
              left: "0.75rem",
              right: "0.25rem",
              top: `${(chord.barreAt - startFret + 1) * 26 + 20}px`,
            }}
          />
        )}
      </div>

      {/* Notes in chord */}
      <div className="mt-3 flex gap-2 text-sm">
        {chord.notes.map((note, idx) => (
          <span
            key={idx}
            className="px-2 py-0.5 bg-secondary rounded text-muted-foreground"
          >
            {note}
          </span>
        ))}
      </div>
    </div>
  )
}

export function HitTheChordGame({
  currentPitch,
  isRecordingActive,
  onStartRecording,
  onStopRecording,
}: HitTheChordGameProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")

  const {
    phase,
    currentChord,
    score,
    lives,
    attempts,
    isPlayingChord,
    hitProgress,
    isHittingChord,
    detectedNotes,
    matchedNotes,
    startGame,
    playCurrentChord,
    processPitch,
    skipChord,
    reset,
  } = useHitTheChordGame(difficulty)

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
          <div className="flex justify-center">
            <Guitar className="w-16 h-16 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Hit the Chord!</h2>
            <p className="text-sm text-muted-foreground">
              Zagraj pokazany akord na gitarze
            </p>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border space-y-3">
          <h3 className="font-semibold text-sm">Jak grac:</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">1.</span>
              <span>Zobaczysz akord do zagrania</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">2.</span>
              <span>Zagraj akord na gitarze (strun kazda z nut)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-perfect">3.</span>
              <span>Utrzymaj akord przez ~2 sekundy</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-pitch-off">4.</span>
              <span>Mozesz pominac akord, ale stracisz zycie</span>
            </li>
          </ul>
        </div>

        {/* Difficulty Selector */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Music className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Poziom trudnosci</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setDifficulty("easy")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                difficulty === "easy"
                  ? "bg-pitch-perfect text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Latwy
            </button>
            <button
              onClick={() => setDifficulty("medium")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                difficulty === "medium"
                  ? "bg-pitch-good text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Sredni
            </button>
            <button
              onClick={() => setDifficulty("hard")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                difficulty === "hard"
                  ? "bg-pitch-off text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Trudny
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {difficulty === "easy" && "Podstawowe akordy: C, G, D, Em, Am"}
            {difficulty === "medium" && "Wiecej akordow: + A, E, Dm"}
            {difficulty === "hard" && "Wszystkie akordy wlacznie z barre: + F, Bm, 7"}
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

  // Celebrating Phase - Chord Hit!
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
          <div className="text-6xl animate-bounce">🎸</div>
          <div className="text-5xl font-bold text-pitch-perfect">PERFECT!</div>
          <div className="text-2xl font-mono text-foreground">
            {currentChord?.displayName}
          </div>
          <div className="text-pitch-perfect font-semibold text-lg">
            +15 punktow!
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
  if (phase === "playing" && currentChord) {
    const successfulHits = attempts.filter((a) => a.success).length

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

        {/* Current Chord Display with Diagram */}
        <div
          className={`bg-card rounded-xl p-6 border-2 text-center space-y-4 transition-all ${
            isHittingChord ? "border-pitch-perfect bg-pitch-perfect/5" : "border-border"
          }`}
        >
          <div className="text-sm text-muted-foreground">Zagraj akord:</div>
          <ChordDiagram chord={currentChord} />

          {/* Hit Progress Bar */}
          <div className="relative w-full h-4 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                hitProgress > 80
                  ? "bg-gradient-to-r from-pitch-perfect to-pitch-good"
                  : hitProgress > 40
                    ? "bg-pitch-good"
                    : "bg-pitch-perfect"
              }`}
              style={{ width: `${hitProgress}%` }}
            />
          </div>

          <div className="text-xs text-muted-foreground">
            {hitProgress < 10
              ? "Zacznij grac..."
              : hitProgress < 50
                ? "Utrzymuj akord..."
                : hitProgress < 80
                  ? "Swietnie! Jeszcze chwile..."
                  : "Prawie!"}
          </div>
        </div>

        {/* Detected Notes */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Wykryte nuty:</div>
          <div className="flex flex-wrap gap-2">
            {currentChord.notes.map((note) => {
              const isMatched = matchedNotes.includes(note)
              return (
                <span
                  key={note}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    isMatched
                      ? "bg-pitch-perfect/20 text-pitch-perfect border border-pitch-perfect"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {note} {isMatched && "✓"}
                </span>
              )
            })}
          </div>
          {detectedNotes.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Slyszane: {detectedNotes.slice(-5).join(", ")}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="bg-card rounded-xl p-3 border border-border">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Trafione akordy:</span>
            <span className="font-bold text-pitch-perfect">{successfulHits}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={playCurrentChord}
            disabled={isPlayingChord}
            variant="secondary"
            size="lg"
            className="flex-1 gap-2"
          >
            <Volume2 className={`w-5 h-5 ${isPlayingChord ? "animate-pulse" : ""}`} />
            {isPlayingChord ? "Gram..." : "Powtorz akord"}
          </Button>
          <Button
            onClick={skipChord}
            variant="outline"
            size="lg"
            className="gap-2 border-pitch-off text-pitch-off hover:bg-pitch-off/10"
          >
            <SkipForward className="w-5 h-5" />
            Pomin
          </Button>
        </div>
      </div>
    )
  }

  // Game Over Phase
  if (phase === "gameover") {
    const successfulHits = attempts.filter((a) => a.success).length
    const totalAttempts = attempts.length
    const accuracy =
      totalAttempts > 0 ? Math.round((successfulHits / totalAttempts) * 100) : 0

    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div className="text-6xl">🎸</div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Koniec gry!</h2>
            <p className="text-sm text-muted-foreground">Swietna proba!</p>
          </div>
        </div>

        {/* Final Score */}
        <div className="bg-pitch-perfect/10 rounded-xl p-6 border border-pitch-perfect/30 text-center space-y-2">
          <div className="text-sm text-muted-foreground">Koncowy wynik</div>
          <div className="text-5xl font-bold text-pitch-perfect">{score}</div>
          <div className="text-sm text-muted-foreground">
            {successfulHits} {successfulHits === 1 ? "akord trafiony" : "akordy trafione"}
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
              <span className="text-sm text-muted-foreground">Pominiete:</span>
              <span className="font-bold text-pitch-off">
                {totalAttempts - successfulHits}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Celnosc:</span>
              <span className="font-bold">{accuracy}%</span>
            </div>
          </div>
        </div>

        {/* Recent Chords */}
        {attempts.length > 0 && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h3 className="font-semibold text-sm mb-3">Ostatnie akordy:</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {attempts
                .slice(-5)
                .reverse()
                .map((attempt, idx) => (
                  <div
                    key={idx}
                    className={`flex justify-between items-center p-2 rounded text-sm ${
                      attempt.success ? "bg-pitch-perfect/20" : "bg-pitch-off/20"
                    }`}
                  >
                    <span className="font-semibold">
                      {attempt.targetChord.displayName}
                    </span>
                    <span>{attempt.success ? "✓ Trafiony" : "✗ Pominiety"}</span>
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
            Wyjdz
          </Button>
        </div>
      </div>
    )
  }

  return null
}
