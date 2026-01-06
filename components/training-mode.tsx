"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useTrainingMode } from "@/hooks/use-training-mode"
import { TRAINING_EXERCISES } from "@/lib/audio-synth"
import { Play, Mic, RotateCcw, Home, Volume2 } from "lucide-react"
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
  const {
    phase,
    selectedExercise,
    isPlayingReference,
    accuracyResults,
    recordedPitches,
    selectExercise,
    playReference,
    startRecording,
    addPitch,
    stopRecording,
    reset,
    retry,
  } = useTrainingMode()

  // Add current pitch to training data when recording
  useEffect(() => {
    if (phase === "recording" && currentPitch) {
      addPitch(currentPitch)
    }
  }, [phase, currentPitch, addPitch])

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

        <div className="grid gap-3">
          {TRAINING_EXERCISES.map((exercise) => (
            <button
              key={exercise.id}
              onClick={() => {
                selectExercise(exercise)
                setTimeout(() => playReference(), 100)
              }}
              className="bg-card hover:bg-accent rounded-xl p-4 border border-border text-left transition-colors"
            >
              <h3 className="font-semibold text-foreground mb-1">{exercise.name}</h3>
              <p className="text-sm text-muted-foreground">{exercise.description}</p>
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
            <p className="text-primary font-semibold">Słuchaj wzorca...</p>
          ) : (
            <div className="flex gap-2 justify-center">
              <Button onClick={playReference} size="lg" className="gap-2">
                <Play className="w-5 h-5" />
                Odtwórz ponownie
              </Button>
            </div>
          )}
        </div>

        {/* Show expected notes */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-3 text-sm">Nuty do zaśpiewania:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedExercise?.notes.map((note, idx) => (
              <div
                key={idx}
                className="px-3 py-2 bg-secondary rounded-lg text-sm font-mono font-semibold"
              >
                {note.note}{note.octave}
              </div>
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
              className="gap-2 bg-pitch-off hover:bg-pitch-off/90"
            >
              <Mic className="w-5 h-5" />
              Zacznij śpiewać
            </Button>
          </div>
        </div>

        {/* Show expected notes */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-3 text-sm">Nuty do zaśpiewania:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedExercise?.notes.map((note, idx) => (
              <div
                key={idx}
                className="px-3 py-2 bg-secondary rounded-lg text-sm font-mono font-semibold"
              >
                {note.note}{note.octave}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Recording Phase
  if (phase === "recording") {
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

        {/* Show expected notes */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-3 text-sm">Nuty do zaśpiewania:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedExercise?.notes.map((note, idx) => (
              <div
                key={idx}
                className="px-3 py-2 bg-secondary rounded-lg text-sm font-mono font-semibold"
              >
                {note.note}{note.octave}
              </div>
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

