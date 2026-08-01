"use client"

/**
 * Pomiar zakresu głosu — onboarding silnika ćwiczeń.
 *
 * Dwa kroki: najniższa i najwyższa wygodna nuta, po kilka sekund trzymania.
 * Wynik to zakres CIĄGŁY w MIDI (ułamkowy), nie typ głosu. Percentyle zamiast
 * skrajności — pojedyncza błędna ramka nie definiuje zakresu.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Button } from "@/components/ui/button"
import {
  loadMeasuredRange,
  midiToLabel,
  robustExtremeMidi,
  saveMeasuredRange,
} from "@/lib/exercise-engine"
import { ArrowLeft, ArrowDown, ArrowUp, Check, Mic, RotateCcw } from "lucide-react"

type Step = "intro" | "low" | "high" | "done"

/** Ile ramek z wysokością trzeba zebrać na krok. Przy ~60/s to ~3 s śpiewu. */
const FRAMES_PER_STEP = 150

export default function RangeMeasurePage() {
  const router = useRouter()
  const { currentPitch, isRecording, startRecording, stopRecording } = useAudioRecorderContext()

  const [step, setStep] = useState<Step>("intro")
  const [progress, setProgress] = useState(0)
  const [lowMidi, setLowMidi] = useState<number | null>(null)
  const [highMidi, setHighMidi] = useState<number | null>(null)
  const [existing] = useState(() => loadMeasuredRange())

  const framesRef = useRef<number[]>([])
  const stepRef = useRef<Step>("intro")
  stepRef.current = step

  useEffect(() => {
    document.title = "Vocal Coach - Pomiar zakresu"
    trackPageView("Vocal Coach - Pomiar zakresu", "/train/range")
  }, [])

  // Zbieranie ramek w krokach pomiarowych.
  useEffect(() => {
    const active = step === "low" || step === "high"
    if (!active || !currentPitch) return

    framesRef.current.push(currentPitch.frequency)
    setProgress(Math.min(100, Math.round((framesRef.current.length / FRAMES_PER_STEP) * 100)))

    if (framesRef.current.length >= FRAMES_PER_STEP) {
      const side = step === "low" ? "low" : "high"
      const extreme = robustExtremeMidi(framesRef.current, side)
      framesRef.current = []
      setProgress(0)

      if (extreme === null) return // za mało ważnych ramek — zbieraj dalej

      if (step === "low") {
        setLowMidi(extreme)
        setStep("high")
      } else {
        setHighMidi(extreme)
        setStep("done")
        stopRecording()
      }
    }
  }, [currentPitch, step, stopRecording])

  // Zapis po ukończeniu obu kroków.
  useEffect(() => {
    if (step !== "done" || lowMidi === null || highMidi === null) return
    if (highMidi - lowMidi < 5) return // pomiar bez sensu — UI pokaże błąd
    saveMeasuredRange({ lowMidi, highMidi, measuredAt: Date.now() })
    trackEvent("range_measured", "Training", undefined, Math.round(highMidi - lowMidi))
  }, [step, lowMidi, highMidi])

  const beginStep = useCallback(
    async (next: "low" | "high") => {
      framesRef.current = []
      setProgress(0)
      if (!isRecording) await startRecording()
      setStep(next)
    },
    [isRecording, startRecording],
  )

  const reset = useCallback(() => {
    framesRef.current = []
    setProgress(0)
    setLowMidi(null)
    setHighMidi(null)
    if (isRecording) stopRecording()
    setStep("intro")
  }, [isRecording, stopRecording])

  useEffect(() => () => { if (stepRef.current !== "done") stopRecording() }, [stopRecording])

  const spanOk = lowMidi !== null && highMidi !== null && highMidi - lowMidi >= 5

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      <button
        onClick={() => router.push("/train")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Powrot do menu
      </button>

      {step === "intro" && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
          <h1 className="text-2xl font-bold">Zmierz swój zakres</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Dwa kroki: najniższa i najwyższa nuta, którą śpiewasz <strong>wygodnie</strong> —
            nie na siłę. Ćwiczenia będą transponowane półton po półtonie dokładnie
            w Twoim zakresie, bez szufladek w rodzaju „tenor" czy „baryton".
          </p>
          {existing && (
            <p className="text-xs text-muted-foreground">
              Obecny zakres: <strong>{midiToLabel(existing.lowMidi)}–{midiToLabel(existing.highMidi)}</strong>{" "}
              — ponowny pomiar go nadpisze.
            </p>
          )}
          <Button onClick={() => beginStep("low")} size="lg" className="gap-2">
            <Mic className="w-5 h-5" />
            Zaczynamy
          </Button>
        </div>
      )}

      {(step === "low" || step === "high") && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-5 text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {step === "low" ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
            Krok {step === "low" ? "1 z 2" : "2 z 2"}
          </div>
          <h2 className="text-xl font-bold">
            {step === "low"
              ? "Zejdź najniżej, jak jest wygodnie, i trzymaj nutę"
              : "Wejdź najwyżej, jak jest wygodnie, i trzymaj nutę"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {step === "low"
              ? "Dowolna samogłoska, np. „aaa”. Spokojnie, bez dociskania."
              : "Falset się liczy, jeśli jest wygodny. Nie krzycz."}
          </p>

          <div className="text-5xl font-bold tabular-nums h-16 flex items-center justify-center">
            {currentPitch ? `${currentPitch.note}${currentPitch.octave}` : "—"}
          </div>

          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress === 0 ? "Czekam na Twój głos…" : "Trzymaj…"}
          </p>
        </div>
      )}

      {step === "done" && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4 text-center">
          {spanOk ? (
            <>
              <div className="flex items-center justify-center gap-2 text-pitch-perfect">
                <Check className="w-6 h-6" />
                <h2 className="text-xl font-bold">Zakres zmierzony</h2>
              </div>
              <p className="text-4xl font-bold">
                {midiToLabel(lowMidi!)} – {midiToLabel(highMidi!)}
              </p>
              <p className="text-sm text-muted-foreground">
                {Math.round(highMidi! - lowMidi!)} półtonów. Ćwiczenia dopasują się do tego pasma —
                zakres możesz zmierzyć ponownie w każdej chwili.
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => router.push("/train/exercises")} size="lg">
                  Przejdź do ćwiczeń
                </Button>
                <Button onClick={reset} variant="ghost" size="lg" className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Zmierz ponownie
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold">Coś poszło nie tak</h2>
              <p className="text-sm text-muted-foreground">
                Zmierzony zakres wyszedł węższy niż 5 półtonów — to prawie na pewno błąd
                pomiaru, nie Twój głos. Spróbuj w cichszym miejscu.
              </p>
              <Button onClick={reset} size="lg" className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Spróbuj jeszcze raz
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
