"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { AudioSynthesizer, type ToneNote } from "@/lib/audio-synth"
import { type PitchData, noteToFrequency } from "@/lib/pitch-detector"

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

// ~3 seconds at ~20 pitch detections per second
const REQUIRED_CONSECUTIVE_HITS = 60

export type GamePhase = "ready" | "playing" | "celebrating" | "gameover"
export type OctaveRange = "low" | "medium" | "high"
export type PitchDirection = "perfect" | "sharp" | "flat" | null

export interface GameNote {
  note: string
  octave: number
  frequency: number
}

export interface NoteAttempt {
  targetNote: GameNote
  success: boolean
  averageCents: number
  timeToHit: number
}

export interface PitchFeedback {
  direction: PitchDirection
  cents: number
  userNote: string
  userOctave: number
}

export function useHitTheNoteGame(octaveRange: OctaveRange = "medium") {
  const [phase, setPhase] = useState<GamePhase>("ready")
  const [currentNote, setCurrentNote] = useState<GameNote | null>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [attempts, setAttempts] = useState<NoteAttempt[]>([])
  const [isPlayingNote, setIsPlayingNote] = useState(false)
  const [hitProgress, setHitProgress] = useState(0)
  const [isHittingNote, setIsHittingNote] = useState(false)
  const [pitchFeedback, setPitchFeedback] = useState<PitchFeedback | null>(null)

  const synthesizerRef = useRef<AudioSynthesizer | null>(null)
  const noteStartTimeRef = useRef<number>(0)
  const correctPitchCountRef = useRef(0)
  const totalPitchCountRef = useRef(0)
  const consecutiveCorrectRef = useRef(0)

  useEffect(() => {
    if (typeof window !== "undefined" && !synthesizerRef.current) {
      synthesizerRef.current = new AudioSynthesizer()
    }

    return () => {
      if (synthesizerRef.current) {
        synthesizerRef.current.close()
        synthesizerRef.current = null
      }
    }
  }, [])

  const generateRandomNote = useCallback((): GameNote => {
    // Set octave range based on user preference
    let minOctave: number
    let maxOctave: number
    
    if (octaveRange === "low") {
      minOctave = 3
      maxOctave = 3 // C3 to B3
    } else if (octaveRange === "medium") {
      minOctave = 3
      maxOctave = 4 // C3 to B4
    } else {
      minOctave = 3
      maxOctave = 5 // C3 to B5
    }
    
    const octave = minOctave + Math.floor(Math.random() * (maxOctave - minOctave + 1))
    const noteIndex = Math.floor(Math.random() * NOTE_NAMES.length)
    const note = NOTE_NAMES[noteIndex]
    const frequency = noteToFrequency(note, octave)

    return { note, octave, frequency }
  }, [octaveRange])

  const playCurrentNote = useCallback(async () => {
    if (!currentNote || !synthesizerRef.current) return

    setIsPlayingNote(true)
    try {
      console.log(`🎵 Playing: ${currentNote.note}${currentNote.octave} at ${currentNote.frequency.toFixed(2)} Hz`)
      await synthesizerRef.current.playNote(currentNote.note, currentNote.octave, 800)
    } catch (error) {
      console.error("Error playing note:", error)
    } finally {
      setIsPlayingNote(false)
    }
  }, [currentNote])

  const startGame = useCallback(() => {
    const firstNote = generateRandomNote()
    setCurrentNote(firstNote)
    setPhase("playing")
    setScore(0)
    setLives(3)
    setAttempts([])
    setHitProgress(0)
    setIsHittingNote(false)
    correctPitchCountRef.current = 0
    totalPitchCountRef.current = 0
    consecutiveCorrectRef.current = 0
    noteStartTimeRef.current = Date.now()

    // Auto-play the first note
    setTimeout(() => {
      if (synthesizerRef.current) {
        synthesizerRef.current.playNote(firstNote.note, firstNote.octave, 800)
      }
    }, 100)
  }, [generateRandomNote])

  const processPitch = useCallback((pitch: PitchData) => {
    if (phase !== "playing" || !currentNote) return

    totalPitchCountRef.current++

    // Calculate how close the pitch is to the target note
    // Allow octave-agnostic matching since pitch detection can sometimes
    // detect harmonics instead of the fundamental, and people sing in different octaves
    const targetFreq = currentNote.frequency
    let semitonesDiff = 12 * Math.log2(pitch.frequency / targetFreq)
    
    // Normalize to within ±6 semitones (allow any octave of the same note)
    // This handles cases where pitch detector catches harmonics (2x, 4x frequency)
    // or when singers naturally transpose to their comfortable octave
    while (semitonesDiff > 6) semitonesDiff -= 12
    while (semitonesDiff < -6) semitonesDiff += 12
    
    const cents = Math.abs(semitonesDiff * 100)
    const centsWithSign = semitonesDiff * 100

    // Determine pitch direction for feedback
    let direction: PitchDirection = null
    if (cents <= 15) {
      direction = "perfect"
    } else if (centsWithSign > 0) {
      direction = "sharp" // User is singing too high
    } else {
      direction = "flat" // User is singing too low
    }

    // Update pitch feedback for UI
    setPitchFeedback({
      direction,
      cents: Math.round(centsWithSign),
      userNote: pitch.note,
      userOctave: pitch.octave,
    })

    // Consider it correct if within 50 cents (half semitone)
    const isCorrect = cents <= 50

    if (isCorrect) {
      correctPitchCountRef.current++
      consecutiveCorrectRef.current++
    } else {
      // Allow some tolerance - only reset if very off
      if (cents > 100) {
        consecutiveCorrectRef.current = Math.max(0, consecutiveCorrectRef.current - 5)
      } else {
        consecutiveCorrectRef.current = Math.max(0, consecutiveCorrectRef.current - 1)
      }
    }

    // Update progress based on consecutive correct pitches (~3 seconds)
    const progress = Math.min((consecutiveCorrectRef.current / REQUIRED_CONSECUTIVE_HITS) * 100, 100)
    setHitProgress(progress)
    setIsHittingNote(progress > 10)

    // If we have enough consecutive correct pitches, consider it a hit
    if (consecutiveCorrectRef.current >= REQUIRED_CONSECUTIVE_HITS) {
      // Success! Enter celebration mode
      const timeToHit = Date.now() - noteStartTimeRef.current
      const avgCents = cents

      setAttempts(prev => [...prev, {
        targetNote: currentNote,
        success: true,
        averageCents: avgCents,
        timeToHit,
      }])

      setScore(prev => prev + 10)
      setPhase("celebrating")
      setHitProgress(100)
      
      // Play success fanfare! 🎉
      if (synthesizerRef.current) {
        synthesizerRef.current.playSuccessSound()
      }

      // After celebration, move to next note
      setTimeout(() => {
        const nextNote = generateRandomNote()
        setCurrentNote(nextNote)
        setHitProgress(0)
        setIsHittingNote(false)
        setPitchFeedback(null)
        correctPitchCountRef.current = 0
        totalPitchCountRef.current = 0
        consecutiveCorrectRef.current = 0
        noteStartTimeRef.current = Date.now()
        setPhase("playing")

        // Play next note after a moment
        if (synthesizerRef.current) {
          setTimeout(() => {
            synthesizerRef.current?.playNote(nextNote.note, nextNote.octave, 800)
          }, 200)
        }
      }, 1500) // 1.5s celebration time
    }
  }, [phase, currentNote, generateRandomNote])

  const skipNote = useCallback(() => {
    if (phase !== "playing" || !currentNote) return

    const timeSpent = Date.now() - noteStartTimeRef.current
    const avgCents = 0

    setAttempts(prev => [...prev, {
      targetNote: currentNote,
      success: false,
      averageCents: avgCents,
      timeToHit: timeSpent,
    }])

    const newLives = lives - 1
    setLives(newLives)

    if (newLives <= 0) {
      setPhase("gameover")
    } else {
      // Generate next note
      const nextNote = generateRandomNote()
      setCurrentNote(nextNote)
      setHitProgress(0)
      setIsHittingNote(false)
      correctPitchCountRef.current = 0
      totalPitchCountRef.current = 0
      consecutiveCorrectRef.current = 0
      noteStartTimeRef.current = Date.now()

      // Play next note
      if (synthesizerRef.current) {
        setTimeout(() => {
          synthesizerRef.current?.playNote(nextNote.note, nextNote.octave, 800)
        }, 300)
      }
    }
  }, [phase, currentNote, lives, generateRandomNote])

  const reset = useCallback(() => {
    setPhase("ready")
    setCurrentNote(null)
    setScore(0)
    setLives(3)
    setAttempts([])
    setHitProgress(0)
    setIsHittingNote(false)
    setPitchFeedback(null)
    correctPitchCountRef.current = 0
    totalPitchCountRef.current = 0
    consecutiveCorrectRef.current = 0
  }, [])

  return {
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
  }
}

