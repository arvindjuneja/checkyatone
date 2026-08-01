"use client"

/**
 * Trener ćwiczeń: pętla podgląd → odliczanie → śpiew → wynik → pół tonu wyżej.
 *
 * Kolejność faz sama załatwia problem samosłyszenia: syntezator gra WYŁĄCZNIE
 * w fazie podglądu, śpiew zaczyna się po odliczaniu (1,6 s), więc ogon
 * głośnika nigdy nie wpada w okna oceny. W fazie śpiewu nic nie gra.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { AudioSynthesizer } from "@/lib/audio-synth"
import {
  CATEGORY_LABELS,
  EXERCISE_PATTERNS,
  generateExercise,
  loadMeasuredRange,
  midiToLabel,
  midiToNoteName,
  planSession,
  scoreExercise,
  type ExerciseCategory,
  type ExercisePattern,
  type ExerciseResult,
  type GeneratedExercise,
  type MeasuredRange,
  type SessionPlan,
} from "@/lib/exercise-engine"
import { ExerciseStage } from "@/components/exercise-stage"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import { hapticSuccess, hapticTap, stayAwake } from "@/lib/native"
import { ArrowUp, Mic, Play, RotateCcw, Ruler, SkipForward, Square, Volume2 } from "lucide-react"

type Phase = "pick" | "preview" | "countdown" | "singing" | "result" | "summary"

const COUNTDOWN_MS = 1600
const RESULT_TAIL_MS = 250

interface CompletedStep {
  rootMidi: number
  result: ExerciseResult
}

export function ExerciseTrainer() {
  const { currentPitch, pitchHistory, isRecording, startRecording, stopRecording } =
    useAudioRecorderContext()

  const [range, setRange] = useState<MeasuredRange | null>(null)
  const [rangeLoaded, setRangeLoaded] = useState(false)
  const [phase, setPhase] = useState<Phase>("pick")
  const [plan, setPlan] = useState<SessionPlan | null>(null)
  const [rootIndex, setRootIndex] = useState(0)
  const [exercise, setExercise] = useState<GeneratedExercise | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [recordingStartMs, setRecordingStartMs] = useState<number | null>(null)
  const [result, setResult] = useState<ExerciseResult | null>(null)
  const [completed, setCompleted] = useState<CompletedStep[]>([])
  const [countdownLeft, setCountdownLeft] = useState(0)
  const [micError, setMicError] = useState(false)

  const synthesizerRef = useRef<AudioSynthesizer | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pitchHistoryRef = useRef(pitchHistory)
  pitchHistoryRef.current = pitchHistory

  /**
   * Epoka sesji. `runStep` zawiera await (podgląd z syntezatora) i łańcuch
   * timerów; „Zakończ" w trakcie podglądu nie ma jak anulować zawisłego
   * awaita, więc kontynuacja wskrzeszałaby maszynę stanów po śmierci sesji:
   * scoring na martwym nagraniu (fałszywe 0/N), a przy pierwszym kroku pusty
   * ekran (phase=singing przy plan=null). Każde zakończenie/restart podbija
   * epokę; kontynuacja i każdy timer sprawdzają, czy ich epoka wciąż żyje.
   */
  const epochRef = useRef(0)

  // Tożsamości funkcji kontekstu zmieniają się co render providera — do
  // cleanupu odmontowania trzymamy je w refach (pusta lista zależności).
  const stopRecordingRef = useRef(stopRecording)
  stopRecordingRef.current = stopRecording
  const isRecordingRef = useRef(isRecording)
  isRecordingRef.current = isRecording

  useEffect(() => {
    setRange(loadMeasuredRange())
    setRangeLoaded(true)
    if (typeof window !== "undefined" && !synthesizerRef.current) {
      synthesizerRef.current = new AudioSynthesizer()
    }
    return () => {
      epochRef.current++
      timersRef.current.forEach(clearTimeout)
      if (tickerRef.current) clearInterval(tickerRef.current)
      synthesizerRef.current?.close()
      synthesizerRef.current = null
      void stayAwake(false)
      // Nawigacja w trakcie sesji nie może zostawić żywego mikrofonu.
      if (isRecordingRef.current) stopRecordingRef.current()
    }
  }, [])

  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms))
  }, [])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    if (tickerRef.current) {
      clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }, [])

  /** Podgląd: syntezator gra wzorzec; potem odliczanie i śpiew. */
  const runStep = useCallback(
    async (currentPlan: SessionPlan, index: number) => {
      clearTimers()
      const epoch = epochRef.current
      const generated = generateExercise(currentPlan.pattern, currentPlan.roots[index])
      setExercise(generated)
      setResult(null)
      setRecordingStartMs(null)
      setElapsedMs(null)
      setPhase("preview")

      const synth = synthesizerRef.current
      if (synth) {
        const toneNotes = generated.notes.map((n) => {
          const { note, octave } = midiToNoteName(n.midi)
          return { note, octave, duration: n.durationMs }
        })
        await synth.playNoteSequence(toneNotes, 80)
      }

      // Sesja zakończona/zrestartowana w trakcie podglądu — martwy krok
      // nie ma prawa dotknąć maszyny stanów.
      if (epochRef.current !== epoch) return

      // Odliczanie — przez ten czas ogon głośnika wybrzmiewa poza oknami oceny.
      setPhase("countdown")
      setCountdownLeft(Math.ceil(COUNTDOWN_MS / 800))
      const countdownTicks = Math.ceil(COUNTDOWN_MS / 800)
      for (let i = 1; i < countdownTicks; i++) {
        after(i * 800, () => setCountdownLeft(countdownTicks - i))
      }

      after(COUNTDOWN_MS, () => {
        if (epochRef.current !== epoch) return
        const anchor = Date.now()
        setRecordingStartMs(anchor)
        setElapsedMs(0)
        setPhase("singing")

        tickerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - anchor)
        }, 50)

        after(generated.totalMs + RESULT_TAIL_MS, () => {
          if (epochRef.current !== epoch) return
          if (tickerRef.current) {
            clearInterval(tickerRef.current)
            tickerRef.current = null
          }
          const scored = scoreExercise(pitchHistoryRef.current, generated, anchor)
          if (scored.hitCount === scored.notes.length) void hapticSuccess()
          else if (scored.hitCount > 0) void hapticTap()
          setResult(scored)
          setElapsedMs(generated.totalMs)
          setPhase("result")
          trackEvent("exercise_step_done", "Training", currentPlan.pattern.id, scored.score)
        })
      })
    },
    [after, clearTimers],
  )

  const startSession = useCallback(
    async (pattern: ExercisePattern) => {
      if (!range) return
      const newPlan = planSession(pattern, range)
      setPlan(newPlan)
      setRootIndex(0)
      setCompleted([])
      if (!isRecording) {
        const ok = await startRecording()
        if (!ok) {
          setMicError(true)
          setPlan(null)
          return
        }
      }
      setMicError(false)
      void stayAwake(true)
      trackEvent("exercise_session_started", "Training", pattern.id, newPlan.roots.length)
      void runStep(newPlan, 0)
    },
    [range, isRecording, startRecording, runStep],
  )

  const nextStep = useCallback(() => {
    if (!plan || !result) return
    epochRef.current++
    const done = [...completed, { rootMidi: plan.roots[rootIndex], result }]
    setCompleted(done)

    if (rootIndex + 1 >= plan.roots.length) {
      stopRecording()
      void stayAwake(false)
      setPhase("summary")
      trackEvent("exercise_session_done", "Training", plan.pattern.id, done.length)
      return
    }
    setRootIndex(rootIndex + 1)
    void runStep(plan, rootIndex + 1)
  }, [plan, result, completed, rootIndex, stopRecording, runStep])

  const repeatStep = useCallback(() => {
    if (!plan) return
    epochRef.current++
    void runStep(plan, rootIndex)
  }, [plan, rootIndex, runStep])

  const endSession = useCallback(() => {
    epochRef.current++
    clearTimers()
    synthesizerRef.current?.stopAllSounds()
    void stayAwake(false)
    if (isRecording) stopRecording()
    if (completed.length > 0 || result) {
      setPhase("summary")
    } else {
      setPhase("pick")
      setPlan(null)
    }
  }, [clearTimers, isRecording, stopRecording, completed.length, result])

  const backToPick = useCallback(() => {
    epochRef.current++
    clearTimers()
    if (isRecording) stopRecording()
    setPhase("pick")
    setPlan(null)
    setExercise(null)
    setResult(null)
    setCompleted([])
  }, [clearTimers, isRecording, stopRecording])

  // ── Brak zmierzonego zakresu ──
  if (rangeLoaded && !range) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 space-y-4 text-center">
        <Ruler className="w-10 h-10 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-bold">Najpierw zmierz swój zakres</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Ćwiczenia transponują się półton po półtonie w Twoim zakresie — bez pomiaru
          nie wiadomo, gdzie zacząć. To dwa kroki, mniej niż minuta.
        </p>
        <Button asChild size="lg">
          <Link href="/train/range">Zmierz zakres</Link>
        </Button>
      </div>
    )
  }

  // ── Wybór wzorca ──
  if (phase === "pick") {
    const categories = Object.keys(CATEGORY_LABELS) as ExerciseCategory[]
    return (
      <div className="space-y-6">
        {range && (
          <div className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3">
            <p className="text-sm">
              Twój zakres: <strong>{midiToLabel(range.lowMidi)}–{midiToLabel(range.highMidi)}</strong>
            </p>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link href="/train/range"><Ruler className="w-4 h-4" />Zmierz ponownie</Link>
            </Button>
          </div>
        )}
        {micError && (
          <p className="text-sm text-pitch-off bg-pitch-off/10 rounded-xl px-4 py-3">
            Brak dostępu do mikrofonu — bez niego ćwiczenie nie ma jak ocenić śpiewu.
            Sprawdź uprawnienia i spróbuj ponownie.
          </p>
        )}
        {categories.map((category) => (
          <div key={category} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXERCISE_PATTERNS.filter((p) => p.category === category).map((pattern) => (
                <button
                  key={pattern.id}
                  onClick={() => void startSession(pattern)}
                  className="text-left bg-card rounded-xl border border-border p-4 hover:border-primary/50 transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{pattern.name}</span>
                    <span className="text-xs text-muted-foreground">„{pattern.syllable}"</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{pattern.description}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Sesja ──
  if (!plan || !exercise) return null
  const stepLabel = `${rootIndex + 1}/${plan.roots.length}`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">{plan.pattern.name}</h2>
          <p className="text-xs text-muted-foreground">
            Tonika {midiToLabel(exercise.rootMidi)} • krok {stepLabel} • sylaba „{plan.pattern.syllable}"
          </p>
        </div>
        <Button onClick={phase === "summary" ? backToPick : endSession} variant="ghost" size="sm" className="gap-2">
          <Square className="w-4 h-4" />
          Zakończ
        </Button>
      </div>

      {phase !== "summary" && (
        <div className="rounded-2xl bg-card border border-border p-3" style={{ height: "300px" }}>
          <ExerciseStage
            exercise={exercise}
            pitchHistory={pitchHistory}
            recordingStartMs={recordingStartMs}
            elapsedMs={elapsedMs}
          />
        </div>
      )}

      {phase === "preview" && (
        <div className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2 py-3">
          <Volume2 className="w-4 h-4 animate-pulse" />
          Posłuchaj wzorca…
        </div>
      )}

      {phase === "countdown" && (
        <div className="text-center py-3">
          <span className="text-4xl font-bold tabular-nums">{countdownLeft}</span>
          <p className="text-xs text-muted-foreground mt-1">Przygotuj się…</p>
        </div>
      )}

      {phase === "singing" && (
        <div className="text-center text-sm flex items-center justify-center gap-3 py-3">
          <Mic className="w-4 h-4 text-destructive animate-pulse" />
          Śpiewaj: <strong>„{plan.pattern.syllable}"</strong>
          <span className="text-muted-foreground tabular-nums">
            {currentPitch ? `${currentPitch.note}${currentPitch.octave}` : "—"}
          </span>
        </div>
      )}

      {phase === "result" && result && (
        <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">
                {result.hitCount}/{result.notes.length}
                <span className="text-base font-normal text-muted-foreground ml-2">nut trafionych</span>
              </p>
              {result.medianAbsCents !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  mediana odchyłki {Math.round(result.medianAbsCents)}¢
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1 max-w-[50%] justify-end">
              {result.notes.map((note, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-1 rounded-full ${
                    note.hit
                      ? "bg-pitch-perfect/15 text-pitch-perfect"
                      : note.centsError === null
                        ? "bg-secondary text-muted-foreground"
                        : "bg-pitch-off/15 text-pitch-off"
                  }`}
                  title={
                    note.centsError === null
                      ? "brak śpiewu"
                      : `${note.centsError > 0 ? "+" : ""}${Math.round(note.centsError)}¢`
                  }
                >
                  {midiToLabel(note.target.midi)}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={nextStep} size="lg" className="flex-1 gap-2">
              {rootIndex + 1 >= plan.roots.length ? (
                <>Podsumowanie</>
              ) : (
                <><ArrowUp className="w-4 h-4" />
                  {plan.roots[rootIndex + 1] > plan.roots[rootIndex] ? "Pół tonu wyżej" : "Pół tonu niżej"}</>
              )}
            </Button>
            <Button onClick={repeatStep} variant="secondary" size="lg" className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Powtórz
            </Button>
            <Button onClick={nextStep} variant="ghost" size="lg" className="gap-2">
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {phase === "summary" && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4 text-center">
          <h3 className="text-xl font-bold">Sesja zakończona</h3>
          {completed.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {completed.length} {completed.length === 1 ? "krok" : "kroków"} •{" "}
                {completed.reduce((a, s) => a + s.result.hitCount, 0)}/
                {completed.reduce((a, s) => a + s.result.notes.length, 0)} nut trafionych
              </p>
              <div className="flex flex-wrap gap-1 justify-center">
                {completed.map((step, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-1 rounded-full ${
                      step.result.score >= 80
                        ? "bg-pitch-perfect/15 text-pitch-perfect"
                        : step.result.score >= 50
                          ? "bg-pitch-good/15 text-pitch-good"
                          : "bg-pitch-off/15 text-pitch-off"
                    }`}
                  >
                    {midiToLabel(step.rootMidi)} · {step.result.score}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nic nie zostało ukończone.</p>
          )}
          <div className="flex gap-2 justify-center">
            <Button onClick={backToPick} size="lg" className="gap-2">
              <Play className="w-4 h-4" />
              Inne ćwiczenie
            </Button>
            {plan && (
              <Button
                onClick={() => void startSession(plan.pattern)}
                variant="secondary"
                size="lg"
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Jeszcze raz
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
