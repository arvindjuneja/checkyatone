"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { parseMidiFile, parseMidiBuffer, transposeMidi, type ParsedMidi, type MidiNote } from "@/lib/midi-parser"
import { type PitchData } from "@/lib/pitch-detector"

export interface SingAlongState {
  phase: "loading" | "ready" | "countdown" | "playing" | "paused" | "finished" | "track-select"
  midi: ParsedMidi | null
  originalMidi: ParsedMidi | null  // Keep original for transposition
  currentTime: number      // Current position in ms
  score: number
  totalNotes: number
  transpose: number        // Semitones to transpose (-12, 0, +12 etc)
  selectedTrackIndex: number | null  // Which track is selected (null = all)
}

export interface PitchPoint {
  time: number         // Time in ms
  frequency: number
  note: string
  octave: number
  midiNumber: number   // For easy comparison
}

// Constants
const LOOK_AHEAD_MS = 4000   // How far ahead to show
const LOOK_BEHIND_MS = 2000  // How far behind to show
const PLAYBACK_SPEED = 1.0   // Normal speed when singing

export function useSingAlong() {
  const [state, setState] = useState<SingAlongState>({
    phase: "loading",
    midi: null,
    originalMidi: null,
    currentTime: 0,
    score: 0,
    totalNotes: 0,
    transpose: 0,
    selectedTrackIndex: null,
  })

  const [countdown, setCountdown] = useState(3)
  const [pitchHistory, setPitchHistory] = useState<PitchPoint[]>([])
  const [isSinging, setIsSinging] = useState(false)

  const lastPitchTimeRef = useRef<number>(0)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number>(0)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to process loaded MIDI and decide if track selection is needed
  const processMidiLoaded = useCallback((midi: ParsedMidi) => {
    // Check if there are multiple tracks with notes
    const tracksWithNotes = midi.tracks.filter(t => t.notes.length > 0)
    
    if (tracksWithNotes.length > 1) {
      // Multiple tracks - show track selection
      setState({
        phase: "track-select",
        midi,
        originalMidi: midi,
        currentTime: 0,
        score: 0,
        totalNotes: midi.notes.length,
        transpose: 0,
        selectedTrackIndex: null,
      })
    } else {
      // Single track or no tracks - go directly to ready
      setState({
        phase: "ready",
        midi,
        originalMidi: midi,
        currentTime: 0,
        score: 0,
        totalNotes: midi.notes.length,
        transpose: 0,
        selectedTrackIndex: tracksWithNotes.length === 1 ? midi.tracks.indexOf(tracksWithNotes[0]) : null,
      })
    }
    setPitchHistory([])
  }, [])

  // Load a MIDI file from URL
  const loadMidi = useCallback(async (url: string) => {
    setState((prev) => ({ ...prev, phase: "loading" }))

    try {
      const midi = await parseMidiFile(url)
      processMidiLoaded(midi)
    } catch (error) {
      console.error("Failed to load MIDI:", error)
      setState((prev) => ({ ...prev, phase: "ready" }))
    }
  }, [processMidiLoaded])

  // Load a MIDI file from ArrayBuffer (for file uploads)
  const loadMidiFromBuffer = useCallback((arrayBuffer: ArrayBuffer, fileName: string) => {
    setState((prev) => ({ ...prev, phase: "loading" }))

    try {
      const midi = parseMidiBuffer(arrayBuffer, fileName)
      processMidiLoaded(midi)
    } catch (error) {
      console.error("Failed to parse MIDI:", error)
      setState((prev) => ({ ...prev, phase: "ready" }))
    }
  }, [processMidiLoaded])

  // Select a specific track
  const selectTrack = useCallback((trackIndex: number | null) => {
    setState((prev) => {
      if (!prev.originalMidi) return prev
      
      let filteredMidi: ParsedMidi
      
      if (trackIndex === null) {
        // Use all tracks
        filteredMidi = prev.originalMidi
      } else {
        // Filter to only selected track's notes
        const selectedTrack = prev.originalMidi.tracks[trackIndex]
        if (!selectedTrack) return prev
        
        filteredMidi = {
          ...prev.originalMidi,
          notes: [...selectedTrack.notes].sort((a, b) => a.startTime - b.startTime),
        }
      }
      
      return {
        ...prev,
        phase: "ready",
        midi: filteredMidi,
        totalNotes: filteredMidi.notes.length,
        selectedTrackIndex: trackIndex,
      }
    })
  }, [])

  // Transpose the song
  const setTranspose = useCallback((semitones: number) => {
    setState((prev) => {
      if (!prev.originalMidi) return prev
      
      // Transpose original MIDI
      const transposedOriginal = transposeMidi(prev.originalMidi, semitones)
      
      // If a track is selected, filter to that track's notes
      let transposedMidi: ParsedMidi
      if (prev.selectedTrackIndex !== null) {
        const selectedTrack = transposedOriginal.tracks[prev.selectedTrackIndex]
        transposedMidi = {
          ...transposedOriginal,
          notes: selectedTrack ? [...selectedTrack.notes].sort((a, b) => a.startTime - b.startTime) : [],
        }
      } else {
        transposedMidi = transposedOriginal
      }
      
      return {
        ...prev,
        midi: transposedMidi,
        originalMidi: transposeMidi(prev.originalMidi, semitones), // Keep original transposed too
        transpose: semitones,
      }
    })
  }, [])

  // Get visible notes (for piano roll)
  const getVisibleNotes = useCallback((): MidiNote[] => {
    if (!state.midi) return []

    const windowStart = state.currentTime - LOOK_BEHIND_MS
    const windowEnd = state.currentTime + LOOK_AHEAD_MS

    return state.midi.notes.filter(
      (note) =>
        note.startTime + note.duration >= windowStart && note.startTime <= windowEnd
    )
  }, [state.midi, state.currentTime])

  // Get visible pitch history (user's singing)
  const getVisiblePitchHistory = useCallback((): PitchPoint[] => {
    const windowStart = state.currentTime - LOOK_BEHIND_MS
    const windowEnd = state.currentTime + 500 // Slight look-ahead for current

    return pitchHistory.filter(
      (p) => p.time >= windowStart && p.time <= windowEnd
    )
  }, [state.currentTime, pitchHistory])

  // Animation loop - advances time when singing
  const updatePlayback = useCallback(() => {
    if (state.phase !== "playing") return

    const now = Date.now()
    const deltaMs = now - lastFrameTimeRef.current
    lastFrameTimeRef.current = now

    // Only advance if singing
    if (isSinging) {
      setState((prev) => {
        const newTime = prev.currentTime + deltaMs * PLAYBACK_SPEED

        // Check if song finished
        if (prev.midi && newTime >= prev.midi.duration + 1000) {
          return { ...prev, phase: "finished", currentTime: prev.midi.duration }
        }

        return { ...prev, currentTime: newTime }
      })
    }

    animationFrameRef.current = requestAnimationFrame(updatePlayback)
  }, [state.phase, isSinging])

  // Process incoming pitch - this drives the playback
  const processPitch = useCallback(
    (pitch: PitchData) => {
      if (state.phase !== "playing") return

      // Mark as singing
      setIsSinging(true)
      lastPitchTimeRef.current = Date.now()

      // Clear any silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }

      // Set timeout to detect silence
      silenceTimeoutRef.current = setTimeout(() => {
        setIsSinging(false)
      }, 200) // 200ms of silence = pause

      // Convert pitch to MIDI number for comparison
      const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
      const noteIndex = NOTE_NAMES.indexOf(pitch.note)
      const midiNumber = (pitch.octave + 1) * 12 + noteIndex

      // Add to pitch history
      const pitchPoint: PitchPoint = {
        time: state.currentTime,
        frequency: pitch.frequency,
        note: pitch.note,
        octave: pitch.octave,
        midiNumber,
      }

      setPitchHistory((prev) => {
        // Keep only recent history to avoid memory issues
        const cutoff = state.currentTime - 30000 // Keep 30s
        const filtered = prev.filter((p) => p.time >= cutoff)
        return [...filtered, pitchPoint]
      })
    },
    [state.phase, state.currentTime]
  )

  // Handle no pitch (silence)
  const processNoPitch = useCallback(() => {
    if (state.phase !== "playing") return
    
    // Will be handled by the silence timeout
  }, [state.phase])

  // Start playing with countdown
  const startPlayback = useCallback(() => {
    if (!state.midi || state.phase === "playing") return

    setState((prev) => ({ ...prev, phase: "countdown" }))
    setCountdown(3)

    let count = 3
    const countdownInterval = setInterval(() => {
      count--
      setCountdown(count)

      if (count <= 0) {
        clearInterval(countdownInterval)
        
        lastFrameTimeRef.current = Date.now()
        setPitchHistory([])
        setIsSinging(false)

        setState((prev) => ({
          ...prev,
          phase: "playing",
          currentTime: 0,
          score: 0,
        }))
      }
    }, 1000)
  }, [state.midi, state.phase])

  // Pause/resume
  const togglePause = useCallback(() => {
    if (state.phase === "playing") {
      setState((prev) => ({ ...prev, phase: "paused" }))
    } else if (state.phase === "paused") {
      lastFrameTimeRef.current = Date.now()
      setState((prev) => ({ ...prev, phase: "playing" }))
    }
  }, [state.phase])

  // Stop and reset
  const stop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }
    setPitchHistory([])
    setIsSinging(false)
    setState((prev) => ({
      ...prev,
      phase: "ready",
      currentTime: 0,
      score: 0,
    }))
  }, [])

  // Restart
  const restart = useCallback(() => {
    stop()
    setTimeout(() => startPlayback(), 100)
  }, [stop, startPlayback])

  // Start animation loop when playing
  useEffect(() => {
    if (state.phase === "playing") {
      lastFrameTimeRef.current = Date.now()
      animationFrameRef.current = requestAnimationFrame(updatePlayback)
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [state.phase, updatePlayback])

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
      }
    }
  }, [])

  return {
    // State
    state,
    countdown,
    pitchHistory,
    isSinging,

    // Actions
    loadMidi,
    loadMidiFromBuffer,
    startPlayback,
    togglePause,
    stop,
    restart,
    processPitch,
    processNoPitch,
    setTranspose,
    selectTrack,

    // Derived data
    getVisibleNotes,
    getVisiblePitchHistory,
  }
}
