"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useTrainingMode } from "@/hooks/use-training-mode"
import { TRAINING_EXERCISES, getDifficultyLabel, getDifficultyColor, type DifficultyLevel, type ToneNote } from "@/lib/audio-synth"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Play, Mic, RotateCcw, Home, Volume2, Filter, Square, Volume1 } from "lucide-react"
import { type PitchData } from "@/lib/pitch-detector"

interface TrainingModeProps {
  currentPitch: PitchData | null
  isRecordingActive: boolean
  onStartRecording: () => void
  onStopRecording: () => void
}

export function TrainingMode({
  currentPitch,
  isRecordingActive,
  onStartRecording,
  onStopRecording,
}: TrainingModeProps) {
  const [maxDifficulty, setMaxDifficulty] = useState<DifficultyLevel>("hard")
  
  const {
    phase,
    selectedExercise,
    isPlayingReference,
    isPlayingSingleNote,
    accuracyResults,
    recordedPitches,
    selectExercise,
    playReference,
    playSingleNote,
    stopPlaying,
    startRecording,
    addPitch,
    stopRecording,
    reset,
    retry,
  } = useTrainingMode()

  // Filter exercises by difficulty
  const filteredExercises = TRAINING_EXERCISES.filter(exercise => {
    const difficultyOrder: Record<DifficultyLevel, number> = { easy: 1, medium: 2, hard: 3 }
    return difficultyOrder[exercise.difficulty] <= difficultyOrder[maxDifficulty]
  })

  // Add current pitch to training data when recording
  useEffect(() => {
    if (phase === "recording" && currentPitch) {
      addPitch(currentPitch)
    }
  }, [phase, currentPitch, addPitch])

  // Track when exercise is selected
  useEffect(() => {
    if (selectedExercise && phase !== "selecting") {
      const title = `Vocal Coach - Trenuj - ${selectedExercise.name}`
      document.title = title
      trackPageView(title, `/training/${selectedExercise.id}`)
      trackEvent("exercise_selected", "Training", selectedExercise.name)
    }
  }, [selectedExercise, phase])

  // Track when results are shown
  useEffect(() => {
    if (phase === "results" && accuracyResults.length > 0) {
      const overallScore = accuracyResults.reduce((sum, r) => sum + r.hitRate, 0) / accuracyResults.length
      trackEvent("exercise_completed", "Training", selectedExercise?.name, Math.round(overallScore))
    }
  }, [phase, accuracyResults, selectedExercise])

  // Exercise Selection Phase
  if (phase === "selecting") {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-4 border border-border">
          <h2 className="text-xl font-bold mb-2">Wybierz ćwiczenie</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Najpierw usłyszysz wzorcowe dźwięki, a potem spróbujesz je zanucić
          </p>
        </div>

        {/* Difficulty Filter */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Poziom trudności</h3>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMaxDifficulty("easy")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                maxDifficulty === "easy"
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Łatwy
            </button>
            <button
              onClick={() => setMaxDifficulty("medium")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                maxDifficulty === "medium"
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Średni
            </button>
            <button
              onClick={() => setMaxDifficulty("hard")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                maxDifficulty === "hard"
                  ? "bg-foreground text-background"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              Wszystkie
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {maxDifficulty === "easy" && "Pokazuję tylko łatwe ćwiczenia (krótkie interwały)"}
            {maxDifficulty === "medium" && "Pokazuję łatwe i średnie ćwiczenia"}
            {maxDifficulty === "hard" && "Pokazuję wszystkie ćwiczenia"}
          </p>
        </div>

        <div className="grid gap-3">
          {filteredExercises.map((exercise) => (
            <button
              key={exercise.id}
              onClick={() => {
                selectExercise(exercise)
                setTimeout(() => playReference(), 100)
              }}
              className="bg-card hover:bg-accent rounded-xl p-4 border border-border text-left transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">{exercise.name}</h3>
                  <p className="text-sm text-muted-foreground">{exercise.description}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${getDifficultyColor(exercise.difficulty)}`}>
                  {getDifficultyLabel(exercise.difficulty)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Volume2 className="w-4 h-4" />
                <span>{exercise.notes.length} nut</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Listening Phase
  if (phase === "listening") {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Volume2 className={`w-8 h-8 text-primary ${isPlayingReference ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">{selectedExercise?.name}</h2>
            <p className="text-sm text-muted-foreground">{selectedExercise?.description}</p>
          </div>
          {isPlayingReference ? (
            <div className="space-y-2">
              <p className="text-primary font-semibold">Słuchaj wzorca...</p>
              <Button onClick={stopPlaying} size="lg" variant="secondary" className="gap-2">
                <Square className="w-5 h-5" />
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 items-center">
              <Button
                onClick={() => {
                  startRecording()
                  onStartRecording()
                }}
                size="lg"
                className="gap-2 bg-pitch-perfect text-background hover:opacity-90"
              >
                <Mic className="w-5 h-5" />
                Zacznij śpiewać
              </Button>
              <Button onClick={playReference} size="lg" variant="secondary" className="gap-2">
                <Play className="w-5 h-5" />
                Posłuchaj jeszcze raz
              </Button>
            </div>
          )}
        </div>

        {/* Show expected notes - clickable to play individually */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-2 text-sm">Nuty do zaśpiewania:</h3>
          <p className="text-xs text-muted-foreground mb-3">Kliknij nutę, aby usłyszeć jej dźwięk</p>
          <div className="flex flex-wrap gap-2">
            {selectedExercise?.notes.map((note, idx) => (
              <button
                key={idx}
                onClick={() => playSingleNote(note)}
                disabled={isPlayingReference || isPlayingSingleNote}
                className="px-3 py-2 bg-secondary hover:bg-secondary/80 active:bg-pitch-perfect/20 rounded-lg text-sm font-mono font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Volume1 className="w-3 h-3 opacity-50" />
                {note.note}{note.octave}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Ready Phase
  if (phase === "ready") {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-pitch-good/20 flex items-center justify-center">
            <Mic className="w-8 h-8 text-pitch-good" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">Gotowy?</h2>
            <p className="text-sm text-muted-foreground">
              Naciśnij przycisk i zaśpiewaj tę samą sekwencję nut
            </p>
          </div>
          {isPlayingReference ? (
            <div className="space-y-2">
              <p className="text-primary font-semibold">Słuchaj wzorca...</p>
              <Button onClick={stopPlaying} size="lg" variant="secondary" className="gap-2">
                <Square className="w-5 h-5" />
                Stop
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 justify-center">
              <Button onClick={playReference} size="lg" variant="secondary" className="gap-2">
                <Play className="w-5 h-5" />
                Posłuchaj jeszcze raz
              </Button>
              <Button
                onClick={() => {
                  startRecording()
                  onStartRecording()
                }}
                size="lg"
                className="gap-2 bg-pitch-perfect text-background hover:opacity-90"
              >
                <Mic className="w-5 h-5" />
                Zacznij śpiewać
              </Button>
            </div>
          )}
        </div>

        {/* Show expected notes - clickable to play individually */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-2 text-sm">Nuty do zaśpiewania:</h3>
          <p className="text-xs text-muted-foreground mb-3">Kliknij nutę, aby usłyszeć jej dźwięk</p>
          <div className="flex flex-wrap gap-2">
            {selectedExercise?.notes.map((note, idx) => (
              <button
                key={idx}
                onClick={() => playSingleNote(note)}
                disabled={isPlayingReference || isPlayingSingleNote}
                className="px-3 py-2 bg-secondary hover:bg-secondary/80 active:bg-pitch-perfect/20 rounded-lg text-sm font-mono font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Volume1 className="w-3 h-3 opacity-50" />
                {note.note}{note.octave}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Recording Phase
  if (phase === "recording") {
    const firstNote = selectedExercise?.notes[0]

    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-pitch-off/20 flex items-center justify-center">
            <Mic className="w-8 h-8 text-pitch-off animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">Śpiewaj!</h2>
            {currentPitch ? (
              <div className="text-4xl font-mono font-bold text-foreground">
                {currentPitch.note}{currentPitch.octave}
                <span className="text-lg text-muted-foreground ml-2">
                  {currentPitch.cents > 0 ? "+" : ""}{currentPitch.cents}¢
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Czekam na dźwięk...</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Nagranych dźwięków: {recordedPitches.length}
          </p>
          <Button
            onClick={() => {
              stopRecording()
              onStopRecording()
            }}
            size="lg"
            variant="secondary"
            className="gap-2"
          >
            Zakończ nagranie
          </Button>
        </div>

        {/* First note reminder - prominently displayed */}
        {firstNote && (
          <div className="bg-pitch-perfect/10 rounded-xl p-4 border border-pitch-perfect/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-pitch-perfect">Pierwsza nuta (przypomnienie)</h3>
                <p className="text-xs text-muted-foreground">Kliknij, aby usłyszeć ton startowy</p>
              </div>
              <button
                onClick={() => playSingleNote(firstNote)}
                disabled={isPlayingSingleNote}
                className="px-4 py-3 bg-pitch-perfect/20 hover:bg-pitch-perfect/30 active:bg-pitch-perfect/40 rounded-lg text-2xl font-mono font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Volume2 className="w-5 h-5" />
                {firstNote.note}{firstNote.octave}
              </button>
            </div>
          </div>
        )}

        {/* Show all expected notes - clickable to play */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-2 text-sm">Wszystkie nuty:</h3>
          <p className="text-xs text-muted-foreground mb-3">Kliknij nutę, aby usłyszeć jej dźwięk</p>
          <div className="flex flex-wrap gap-2">
            {selectedExercise?.notes.map((note, idx) => (
              <button
                key={idx}
                onClick={() => playSingleNote(note)}
                disabled={isPlayingSingleNote}
                className={`px-3 py-2 rounded-lg text-sm font-mono font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                  idx === 0
                    ? "bg-pitch-perfect/20 hover:bg-pitch-perfect/30 border border-pitch-perfect/50"
                    : "bg-secondary hover:bg-secondary/80"
                }`}
              >
                <Volume1 className="w-3 h-3 opacity-50" />
                {note.note}{note.octave}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Results Phase
  if (phase === "results") {
    const overallScore =
      accuracyResults.length > 0
        ? accuracyResults.reduce((sum, r) => sum + r.hitRate, 0) / accuracyResults.length
        : 0

    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <h2 className="text-xl font-bold">Wyniki</h2>
          <div className="space-y-2">
            <div className="text-5xl font-bold text-foreground">
              {Math.round(overallScore)}%
            </div>
            <p className="text-sm text-muted-foreground">Średnia trafność</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button onClick={retry} size="lg" className="gap-2">
              <RotateCcw className="w-5 h-5" />
              Spróbuj ponownie
            </Button>
            <Button onClick={reset} size="lg" variant="secondary" className="gap-2">
              <Home className="w-5 h-5" />
              Wybierz inne
            </Button>
          </div>
        </div>

        {/* Detailed results */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-3">Szczegóły każdej nuty:</h3>
          <div className="space-y-2">
            {accuracyResults.map((result, idx) => {
              const accuracyColor =
                result.accuracy === "perfect"
                  ? "text-pitch-perfect"
                  : result.accuracy === "good"
                    ? "text-pitch-good"
                    : "text-pitch-off"
              const bgColor =
                result.accuracy === "perfect"
                  ? "bg-pitch-perfect/20"
                  : result.accuracy === "good"
                    ? "bg-pitch-good/20"
                    : "bg-pitch-off/20"

              return (
                <div key={idx} className={`p-3 rounded-lg ${bgColor}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-mono font-semibold">
                        {result.expectedNote.note}{result.expectedNote.octave}
                      </span>
                      <span className={`ml-2 text-sm ${accuracyColor}`}>
                        {result.averageCents > 0 ? "+" : ""}{result.averageCents}¢
                      </span>
                    </div>
                    <div className={`font-bold ${accuracyColor}`}>
                      {Math.round(result.hitRate)}%
                    </div>
                  </div>
                  {result.actualPitches.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Brak dźwięku</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-3 text-sm">Legenda:</h3>
          <ul className="text-sm space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pitch-perfect" />
              <span className="text-pitch-perfect font-semibold">Idealnie</span> - ±10 centów
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pitch-good" />
              <span className="text-pitch-good font-semibold">Dobrze</span> - ±25 centów
            </li>
            <li className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pitch-off" />
              <span className="text-pitch-off font-semibold">Do poprawy</span> - {">"}25 centów
            </li>
          </ul>
        </div>
      </div>
    )
  }

  return null
}

