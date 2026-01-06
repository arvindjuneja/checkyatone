"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { AudioSynthesizer, type ToneNote } from "@/lib/audio-synth"
import { type PitchData, noteToFrequency } from "@/lib/pitch-detector"

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export type GamePhase = "ready" | "playing" | "gameover"
export type OctaveRange = "low" | "medium" | "high"

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

export function useHitTheNoteGame(octaveRange: OctaveRange = "medium") {
  const [phase, setPhase] = useState<GamePhase>("ready")
  const [currentNote, setCurrentNote] = useState<GameNote | null>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [attempts, setAttempts] = useState<NoteAttempt[]>([])
  const [isPlayingNote, setIsPlayingNote] = useState(false)
  const [hitProgress, setHitProgress] = useState(0)
  const [isHittingNote, setIsHittingNote] = useState(false)

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
    const targetFreq = currentNote.frequency
    const semitonesDiff = 12 * Math.log2(pitch.frequency / targetFreq)
    const cents = Math.abs(semitonesDiff * 100)

    // Consider it correct if within 50 cents (half semitone)
    const isCorrect = cents <= 50

    if (isCorrect) {
      correctPitchCountRef.current++
      consecutiveCorrectRef.current++
    } else {
      consecutiveCorrectRef.current = 0
    }

    // Update progress based on consecutive correct pitches
    const progress = Math.min((consecutiveCorrectRef.current / 8) * 100, 100)
    setHitProgress(progress)
    setIsHittingNote(progress > 30)

    // If we have enough consecutive correct pitches, consider it a hit
    if (consecutiveCorrectRef.current >= 8) {
      // Success!
      const timeToHit = Date.now() - noteStartTimeRef.current
      const avgCents = cents

      setAttempts(prev => [...prev, {
        targetNote: currentNote,
        success: true,
        averageCents: avgCents,
        timeToHit,
      }])

      setScore(prev => prev + 10)
      
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
    startGame,
    playCurrentNote,
    processPitch,
    skipNote,
    reset,
  }
}

