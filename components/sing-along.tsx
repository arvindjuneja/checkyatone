"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useSingAlong } from "@/hooks/use-sing-along"
import { AVAILABLE_MIDI_FILES, getTransposeLabel } from "@/lib/midi-parser"
import { type PitchData } from "@/lib/pitch-detector"
import {
  Play,
  Pause,
  RotateCcw,
  Music,
  Upload,
  ChevronLeft,
  ChevronRight,
  Mic,
  MicOff,
  Minus,
  Plus,
} from "lucide-react"

interface SingAlongProps {
  currentPitch: PitchData | null
  isRecordingActive: boolean
  onStartRecording: () => void
  onStopRecording: () => void
}

// Piano roll visualization constants
const PIANO_ROLL_HEIGHT = 300
const PIXELS_PER_MS = 0.12
const PLAYHEAD_X_PERCENT = 0.3 // Playhead at 30% from left

// MIDI note range for display (C2 to C6 = notes 36-84)
const MIN_MIDI_NOTE = 36 // C2
const MAX_MIDI_NOTE = 84 // C6
const TOTAL_NOTES = MAX_MIDI_NOTE - MIN_MIDI_NOTE + 1

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function midiToY(midiNumber: number, height: number): number {
  const normalizedNote = Math.max(MIN_MIDI_NOTE, Math.min(MAX_MIDI_NOTE, midiNumber)) - MIN_MIDI_NOTE
  return height - ((normalizedNote + 0.5) / TOTAL_NOTES) * height
}

function frequencyToMidi(frequency: number): number {
  return 12 * Math.log2(frequency / 440) + 69
}

export function SingAlong({
  currentPitch,
  isRecordingActive,
  onStartRecording,
  onStopRecording,
}: SingAlongProps) {
  const {
    state,
    countdown,
    isSinging,
    loadMidi,
    loadMidiFromBuffer,
    startPlayback,
    togglePause,
    stop,
    restart,
    processPitch,
    setTranspose,
    selectTrack,
    seekTo,
    getVisibleNotes,
    getVisiblePitchHistory,
    getFirstNoteTime,
  } = useSingAlong()

  const [selectedMidiId, setSelectedMidiId] = useState<string | null>(null)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Process pitch when recording
  useEffect(() => {
    if (state.phase === "playing" && currentPitch && isRecordingActive) {
      processPitch(currentPitch)
    }
  }, [state.phase, currentPitch, isRecordingActive, processPitch])

  // Load selected MIDI from list
  const handleSelectMidi = useCallback(
    async (midiId: string) => {
      const midiFile = AVAILABLE_MIDI_FILES.find((m) => m.id === midiId)
      if (midiFile) {
        setSelectedMidiId(midiId)
        setUploadedFileName(null)
        await loadMidi(midiFile.url)
      }
    },
    [loadMidi]
  )

  // Handle file upload
  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      // Check file extension
      if (!file.name.toLowerCase().endsWith(".mid") && !file.name.toLowerCase().endsWith(".midi")) {
        alert("Wybierz plik MIDI (.mid lub .midi)")
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer
        if (arrayBuffer) {
          setSelectedMidiId(null)
          setUploadedFileName(file.name)
          loadMidiFromBuffer(arrayBuffer, file.name)
        }
      }
      reader.readAsArrayBuffer(file)
    },
    [loadMidiFromBuffer]
  )

  // Draw piano roll
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = container.clientWidth
    const height = PIANO_ROLL_HEIGHT
    canvas.width = width
    canvas.height = height

    const playheadX = width * PLAYHEAD_X_PERCENT

    // Clear with dark background
    ctx.fillStyle = "#09090b"
    ctx.fillRect(0, 0, width, height)

    // Draw horizontal grid lines for each note
    for (let i = 0; i <= TOTAL_NOTES; i++) {
      const y = (i / TOTAL_NOTES) * height
      const midiNote = MAX_MIDI_NOTE - i
      const noteIndex = midiNote % 12
      const isWhiteKey = ![1, 3, 6, 8, 10].includes(noteIndex)
      const isC = noteIndex === 0

      // Alternate row colors
      if (isWhiteKey) {
        ctx.fillStyle = "rgba(255,255,255,0.02)"
        ctx.fillRect(0, y, width, height / TOTAL_NOTES)
      }

      ctx.strokeStyle = isC ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)"
      ctx.lineWidth = isC ? 1 : 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()

      // Draw C notes label on the left
      if (isC && i < TOTAL_NOTES) {
        const octave = Math.floor(midiNote / 12) - 1
        ctx.fillStyle = "rgba(255,255,255,0.4)"
        ctx.font = "11px monospace"
        ctx.fillText(`C${octave}`, 4, y + height / TOTAL_NOTES - 4)
      }
    }

    // Time window
    const msPerPixel = 1 / PIXELS_PER_MS
    const timeAtPlayhead = state.currentTime
    const timeAtLeft = timeAtPlayhead - (playheadX * msPerPixel)
    const timeAtRight = timeAtPlayhead + ((width - playheadX) * msPerPixel)

    // Draw vertical time lines
    const timeStep = 1000 // Every second
    for (let t = Math.floor(timeAtLeft / timeStep) * timeStep; t <= timeAtRight; t += timeStep) {
      const x = playheadX + (t - timeAtPlayhead) * PIXELS_PER_MS
      if (x >= 0 && x <= width) {
        ctx.strokeStyle = "rgba(255,255,255,0.06)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
    }

    // Draw MIDI notes
    const visibleNotes = getVisibleNotes()
    for (const note of visibleNotes) {
      const noteX = playheadX + (note.startTime - timeAtPlayhead) * PIXELS_PER_MS
      const noteWidth = Math.max(note.duration * PIXELS_PER_MS, 6)
      const noteY = midiToY(note.midiNumber, height)
      const noteHeight = (height / TOTAL_NOTES) - 2

      // Determine if note is past, current, or future
      const isPast = note.startTime + note.duration < timeAtPlayhead
      const isCurrent = note.startTime <= timeAtPlayhead && note.startTime + note.duration >= timeAtPlayhead
      const isFuture = note.startTime > timeAtPlayhead

      let fillColor: string
      let strokeColor: string
      let alpha = 1

      if (isPast) {
        fillColor = "rgba(100, 100, 120, 0.4)"
        strokeColor = "rgba(100, 100, 120, 0.6)"
        alpha = 0.5
      } else if (isCurrent) {
        fillColor = "rgba(168, 85, 247, 0.8)" // Purple
        strokeColor = "#a855f7"
        // Add glow
        ctx.shadowColor = "rgba(168, 85, 247, 0.6)"
        ctx.shadowBlur = 15
      } else {
        fillColor = "rgba(59, 130, 246, 0.6)" // Blue
        strokeColor = "#3b82f6"
      }

      ctx.globalAlpha = alpha
      ctx.fillStyle = fillColor
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2

      // Draw rounded rectangle
      const radius = 4
      ctx.beginPath()
      ctx.roundRect(noteX, noteY - noteHeight / 2, noteWidth, noteHeight, radius)
      ctx.fill()
      ctx.stroke()

      ctx.shadowBlur = 0
      ctx.globalAlpha = 1

      // Draw note name inside if wide enough
      if (noteWidth > 30 && isCurrent) {
        ctx.fillStyle = "rgba(255,255,255,0.9)"
        ctx.font = "bold 11px sans-serif"
        ctx.fillText(
          `${note.note}${note.octave}`,
          noteX + 6,
          noteY + 4
        )
      }
    }

    // Draw user's pitch trail
    const pitchHistory = getVisiblePitchHistory()
    if (pitchHistory.length > 1) {
      ctx.strokeStyle = "#f97316" // Orange
      ctx.lineWidth = 3
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.beginPath()

      let started = false
      for (let i = 0; i < pitchHistory.length; i++) {
        const point = pitchHistory[i]
        const x = playheadX + (point.time - timeAtPlayhead) * PIXELS_PER_MS
        const midiNum = frequencyToMidi(point.frequency)
        const y = midiToY(midiNum, height)

        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }
      }
      ctx.stroke()

      // Draw shadow/glow for the trail
      ctx.strokeStyle = "rgba(249, 115, 22, 0.3)"
      ctx.lineWidth = 8
      ctx.stroke()
    }

    // Draw current pitch dot
    if (currentPitch && isRecordingActive && state.phase === "playing") {
      const midiNum = frequencyToMidi(currentPitch.frequency)
      const pitchY = midiToY(midiNum, height)

      if (pitchY >= 0 && pitchY <= height) {
        // Glowing dot
        const gradient = ctx.createRadialGradient(
          playheadX, pitchY, 0,
          playheadX, pitchY, 20
        )
        gradient.addColorStop(0, "#f97316")
        gradient.addColorStop(0.5, "rgba(249, 115, 22, 0.5)")
        gradient.addColorStop(1, "transparent")

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(playheadX, pitchY, 20, 0, Math.PI * 2)
        ctx.fill()

        // Inner bright dot
        ctx.fillStyle = "#fb923c"
        ctx.beginPath()
        ctx.arc(playheadX, pitchY, 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw playhead line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.stroke()

    // Draw "NOW" label at bottom
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)"
    ctx.font = "bold 10px sans-serif"
    ctx.fillText("▼", playheadX - 4, 12)
  }, [state.currentTime, state.phase, currentPitch, isRecordingActive, getVisibleNotes, getVisiblePitchHistory])

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // Format time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // MIDI Selection Screen (show if no MIDI loaded)
  if ((!selectedMidiId && !uploadedFileName) || !state.midi) {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto">
            <Music className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Śpiewaj z piosenką!</h2>
            <p className="text-sm text-muted-foreground">
              Wybierz utwór i śpiewaj. Piosenka płynie gdy śpiewasz, 
              zatrzymuje się gdy milczysz. Widzisz swoją linię głosu vs melodię!
            </p>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold text-sm mb-2">Jak to działa:</h3>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-purple-400">🎵</span>
              <span><strong>Fioletowe bloki</strong> = nuty które powinieneś śpiewać</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-400">🔶</span>
              <span><strong>Pomarańczowa linia</strong> = Twój głos</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-400">➡️</span>
              <span>Piosenka <strong>płynie gdy śpiewasz</strong>, zatrzymuje się gdy milczysz</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400">🎚️</span>
              <span>Możesz <strong>obniżyć tonację</strong> jeśli za wysoko!</span>
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-sm px-1">Wybierz utwór:</h3>
          {AVAILABLE_MIDI_FILES.map((midi) => (
            <button
              key={midi.id}
              onClick={() => handleSelectMidi(midi.id)}
              className="w-full bg-card hover:bg-accent rounded-xl p-4 border border-border text-left transition-all hover:scale-[1.01] flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                <Music className="w-6 h-6 text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold">{midi.name}</h4>
                <p className="text-xs text-muted-foreground">{midi.url}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          ))}
        </div>

        {/* File Upload */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Upload className="w-4 h-4 text-purple-400" />
            <h3 className="font-semibold text-sm">Własny plik MIDI</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Wgraj swój plik .mid z melodią wokalną (np. z MuseScore, Logic, FL Studio)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mid,.midi"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            className="w-full gap-2 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
          >
            <Upload className="w-4 h-4" />
            Wybierz plik MIDI
          </Button>
        </div>
      </div>
    )
  }

  // Countdown Screen
  if (state.phase === "countdown") {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl p-8 border border-border text-center space-y-6">
          <div className="text-8xl font-bold text-purple-400 animate-pulse">
            {countdown}
          </div>
          <div className="text-lg text-muted-foreground">Przygotuj się do śpiewania...</div>
          <div className="text-sm">
            <span className="font-mono bg-secondary px-2 py-1 rounded">
              {state.midi?.name}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Track Selection Screen (when MIDI has multiple tracks)
  if (state.phase === "track-select" && state.originalMidi) {
    const tracksWithNotes = state.originalMidi.tracks.filter(t => t.notes.length > 0)
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              stop()
              setSelectedMidiId(null)
              setUploadedFileName(null)
            }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Wróć
          </button>
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium">{state.originalMidi.name}</span>
          </div>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border text-center space-y-4">
          <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center mx-auto">
            <Music className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">Wybierz ścieżkę</h2>
            <p className="text-sm text-muted-foreground">
              Ten plik MIDI ma {tracksWithNotes.length} ścieżek. Wybierz tę z melodią wokalną:
            </p>
          </div>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {tracksWithNotes.map((track, idx) => {
            const originalIndex = state.originalMidi!.tracks.indexOf(track)
            
            // Calculate actual note range (min to max)
            const midiNumbers = track.notes.map(n => n.midiNumber)
            const minNote = Math.min(...midiNumbers)
            const maxNote = Math.max(...midiNumbers)
            const minNoteInfo = { note: NOTE_NAMES[minNote % 12], octave: Math.floor(minNote / 12) - 1 }
            const maxNoteInfo = { note: NOTE_NAMES[maxNote % 12], octave: Math.floor(maxNote / 12) - 1 }
            const noteRange = `${minNoteInfo.note}${minNoteInfo.octave} - ${maxNoteInfo.note}${maxNoteInfo.octave}`
            
            // Calculate duration
            const trackDuration = Math.max(...track.notes.map(n => n.startTime + n.duration))
            const durationSec = Math.round(trackDuration / 1000)
            
            // Try to identify likely vocal tracks
            const lowerName = track.name.toLowerCase()
            const isLikelyVocal = lowerName.includes("vocal") || 
                                  lowerName.includes("voice") || 
                                  lowerName.includes("melody") || 
                                  lowerName.includes("lead") ||
                                  lowerName.includes("sing")
            
            // Check if it's drums (channel 9 or name contains drums)
            const isDrums = track.channel === 9 || lowerName.includes("drum") || lowerName.includes("percussion")
            
            return (
              <button
                key={originalIndex}
                onClick={() => selectTrack(originalIndex)}
                disabled={isDrums}
                className={`w-full bg-card hover:bg-accent rounded-xl p-4 border text-left transition-all hover:scale-[1.01] flex items-center gap-3 ${
                  isLikelyVocal ? "border-purple-500/50 bg-purple-500/5" : 
                  isDrums ? "border-border opacity-50 cursor-not-allowed" : "border-border"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  isLikelyVocal ? "bg-purple-500/20" : 
                  isDrums ? "bg-secondary/50" : "bg-secondary"
                }`}>
                  <span className="font-mono text-sm font-bold">{originalIndex + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold truncate">{track.name}</h4>
                    {isLikelyVocal && (
                      <span className="text-xs px-2 py-0.5 bg-purple-500 text-white rounded-full shrink-0">
                        Melodia?
                      </span>
                    )}
                    {isDrums && (
                      <span className="text-xs px-2 py-0.5 bg-secondary text-muted-foreground rounded-full shrink-0">
                        Perkusja
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {track.notes.length} nut • {noteRange} • {durationSec}s
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </button>
            )
          })}
        </div>

        <div className="bg-secondary/50 rounded-xl p-3 border border-border">
          <p className="text-xs text-muted-foreground text-center">
            💡 Szukaj ścieżki o nazwie "Melody", "Vocal", "Lead" lub podobnej
          </p>
        </div>
      </div>
    )
  }

  // Finished Screen
  if (state.phase === "finished") {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl p-6 border border-purple-500/30 text-center space-y-4">
          <div className="text-6xl">🎤</div>
          <div>
            <h2 className="text-2xl font-bold mb-2">Koniec piosenki!</h2>
            <p className="text-muted-foreground">{state.midi?.name}</p>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border text-center">
          <p className="text-muted-foreground mb-4">
            Świetna robota! Porównaj swoją pomarańczową linię z fioletowymi nutami - 
            im bliżej, tym lepiej trafiałeś!
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              restart()
              if (!isRecordingActive) onStartRecording()
            }}
            size="lg"
            className="flex-1 gap-2 bg-purple-500 hover:bg-purple-600"
          >
            <RotateCcw className="w-5 h-5" />
            Spróbuj ponownie
          </Button>
          <Button
            onClick={() => {
              stop()
              setSelectedMidiId(null)
              setUploadedFileName(null)
              if (isRecordingActive) onStopRecording()
            }}
            size="lg"
            variant="secondary"
            className="gap-2"
          >
            <ChevronLeft className="w-5 h-5" />
            Wróć
          </Button>
        </div>
      </div>
    )
  }

  // Main Playing/Ready/Paused Screen
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            stop()
            setSelectedMidiId(null)
            setUploadedFileName(null)
            if (isRecordingActive) onStopRecording()
          }}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Wróć
        </button>
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium">{state.midi.name}</span>
        </div>
      </div>

      {/* Transpose Control */}
      <div className="bg-card rounded-xl p-3 border border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tonacja:</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTranspose(state.transpose - 12)}
              disabled={state.transpose <= -24 || state.phase === "playing"}
              className="h-8 w-8 p-0"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="w-24 text-center font-mono text-sm">
              {getTransposeLabel(state.transpose)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTranspose(state.transpose + 12)}
              disabled={state.transpose >= 24 || state.phase === "playing"}
              className="h-8 w-8 p-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {state.transpose < 0 ? "Obniżone o " + Math.abs(state.transpose / 12) + " oktawę - łatwiej zaśpiewać!" : 
           state.transpose > 0 ? "Podwyższone o " + (state.transpose / 12) + " oktawę" :
           "Oryginalna tonacja"}
        </p>
      </div>

      {/* Piano Roll */}
      <div
        ref={containerRef}
        className="bg-card rounded-xl border border-border overflow-hidden relative"
      >
        <canvas ref={canvasRef} height={PIANO_ROLL_HEIGHT} className="w-full" />

        {/* Singing indicator */}
        {state.phase === "playing" && (
          <div className={`absolute top-2 right-2 flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            isSinging 
              ? "bg-pitch-perfect/20 text-pitch-perfect border border-pitch-perfect/40" 
              : "bg-secondary text-muted-foreground border border-border"
          }`}>
            {isSinging ? (
              <>
                <Mic className="w-4 h-4 animate-pulse" />
                <span>Śpiewasz...</span>
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4" />
                <span>Zacznij śpiewać</span>
              </>
            )}
          </div>
        )}

        {/* Current pitch display */}
        {state.phase === "playing" && currentPitch && isRecordingActive && (
          <div className="absolute bottom-2 right-2 bg-orange-500/20 backdrop-blur-sm rounded-lg px-3 py-1 border border-orange-500/40">
            <span className="text-orange-400 font-mono font-bold">
              {currentPitch.note}{currentPitch.octave}
            </span>
          </div>
        )}
      </div>

      {/* Timeline - Interactive */}
      <div className="bg-card rounded-xl p-3 border border-border">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-mono">{formatTime(state.currentTime)}</span>
          <span className="text-sm font-mono text-muted-foreground">
            {formatTime(state.midi.duration)}
          </span>
        </div>
        
        {/* Clickable seek bar */}
        <div 
          className="relative w-full h-6 bg-secondary rounded-full overflow-hidden cursor-pointer group"
          onClick={(e) => {
            if (!state.midi) return
            const rect = e.currentTarget.getBoundingClientRect()
            const x = e.clientX - rect.left
            const percent = x / rect.width
            const newTime = percent * state.midi.duration
            seekTo(newTime)
          }}
        >
          {/* Note density visualization */}
          <div className="absolute inset-0 flex">
            {state.midi.notes.length > 0 && (() => {
              // Create buckets to show note density
              const buckets = 50
              const bucketSize = state.midi.duration / buckets
              const density = new Array(buckets).fill(0)
              
              state.midi.notes.forEach(note => {
                const bucket = Math.min(Math.floor(note.startTime / bucketSize), buckets - 1)
                density[bucket]++
              })
              
              const maxDensity = Math.max(...density, 1)
              
              return density.map((count, i) => (
                <div
                  key={i}
                  className="flex-1 flex items-end"
                >
                  <div 
                    className="w-full bg-purple-500/30 rounded-t-sm"
                    style={{ height: `${(count / maxDensity) * 100}%` }}
                  />
                </div>
              ))
            })()}
          </div>
          
          {/* Progress bar */}
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500/80 to-pink-500/80 transition-all duration-100 pointer-events-none"
            style={{
              width: `${(state.currentTime / state.midi.duration) * 100}%`,
            }}
          />
          
          {/* Playhead */}
          <div 
            className="absolute top-0 h-full w-1 bg-white shadow-lg transition-all duration-100 pointer-events-none"
            style={{
              left: `${(state.currentTime / state.midi.duration) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          />
          
          {/* Hover hint */}
          <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors pointer-events-none" />
        </div>
        
        {/* Quick navigation */}
        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seekTo(0)}
            className="text-xs h-7"
          >
            ⏮ Początek
          </Button>
          {getFirstNoteTime() > 1000 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => seekTo(Math.max(0, getFirstNoteTime() - 500))}
              className="text-xs h-7 border-purple-500/50 text-purple-400"
            >
              🎵 Pierwsza nuta ({formatTime(getFirstNoteTime())})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => seekTo(state.currentTime - 5000)}
            className="text-xs h-7"
          >
            -5s
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => seekTo(state.currentTime + 5000)}
            className="text-xs h-7"
          >
            +5s
          </Button>
        </div>
      </div>

      {/* Controls */}
      {state.phase === "ready" ? (
        <Button
          onClick={() => {
            startPlayback()
            if (!isRecordingActive) onStartRecording()
          }}
          size="lg"
          className="w-full gap-2 h-14 text-lg bg-purple-500 hover:bg-purple-600"
        >
          <Play className="w-6 h-6" />
          Zacznij śpiewać!
        </Button>
      ) : state.phase === "paused" ? (
        <div className="flex gap-2">
          <Button
            onClick={togglePause}
            size="lg"
            className="flex-1 gap-2 h-14 bg-purple-500 hover:bg-purple-600"
          >
            <Play className="w-6 h-6" />
            Kontynuuj
          </Button>
          <Button
            onClick={restart}
            size="lg"
            variant="secondary"
            className="gap-2 h-14"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={togglePause}
            size="lg"
            variant="secondary"
            className="flex-1 gap-2 h-14"
          >
            <Pause className="w-6 h-6" />
            Pauza
          </Button>
          <Button
            onClick={restart}
            size="lg"
            variant="outline"
            className="gap-2 h-14"
          >
            <RotateCcw className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Legend */}
      <div className="bg-card rounded-xl p-3 border border-border">
        <div className="flex flex-wrap gap-4 text-xs justify-center">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded bg-purple-500" />
            <span>Teraz</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded bg-blue-500/60" />
            <span>Nadchodzi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-2 rounded-full bg-orange-500" />
            <span>Twój głos</span>
          </div>
        </div>
      </div>

      {/* Help */}
      {state.phase === "playing" && !isSinging && (
        <div className="text-center text-sm text-muted-foreground bg-card rounded-xl p-3 border border-border">
          💡 Piosenka rusza gdy zaczniesz śpiewać i zatrzymuje się gdy milczysz
        </div>
      )}
    </div>
  )
}
