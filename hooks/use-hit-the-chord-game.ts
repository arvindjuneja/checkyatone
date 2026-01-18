"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { AudioSynthesizer } from "@/lib/audio-synth"
import { type PitchData } from "@/lib/pitch-detector"
import { trackEvent } from "@/lib/analytics"
import { CHORDS, CHORD_DIFFICULTIES, type GuitarChord } from "@/lib/guitar"

export type GamePhase = "ready" | "playing" | "celebrating" | "gameover"
export type Difficulty = "easy" | "medium" | "hard"

export interface ChordAttempt {
  targetChord: GuitarChord
  success: boolean
  timeToHit: number
  detectedNotes: string[]
}

// Required consecutive correct detections (~2 seconds)
const REQUIRED_CONSECUTIVE_HITS = 40

export function useHitTheChordGame(difficulty: Difficulty = "easy") {
  const [phase, setPhase] = useState<GamePhase>("ready")
  const [currentChord, setCurrentChord] = useState<GuitarChord | null>(null)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [attempts, setAttempts] = useState<ChordAttempt[]>([])
  const [isPlayingChord, setIsPlayingChord] = useState(false)
  const [hitProgress, setHitProgress] = useState(0)
  const [isHittingChord, setIsHittingChord] = useState(false)
  const [detectedNotes, setDetectedNotes] = useState<string[]>([])
  const [matchedNotes, setMatchedNotes] = useState<string[]>([])
  const [isListeningPaused, setIsListeningPaused] = useState(false)

  const synthesizerRef = useRef<AudioSynthesizer | null>(null)
  const chordStartTimeRef = useRef<number>(0)
  const consecutiveCorrectRef = useRef(0)
  const availableChordsRef = useRef<GuitarChord[]>([])
  const matchedNotesRef = useRef<Set<string>>(new Set())
  const detectedNotesRef = useRef<string[]>([])
  const listeningPauseTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Helper to pause listening while chord plays (prevents mic from catching playback)
  const pauseListeningDuringPlayback = useCallback((durationMs: number = 2000) => {
    // Clear any existing timeout
    if (listeningPauseTimeoutRef.current) {
      clearTimeout(listeningPauseTimeoutRef.current)
    }

    // Pause listening and reset progress
    setIsListeningPaused(true)
    consecutiveCorrectRef.current = 0
    setHitProgress(0)
    setIsHittingChord(false)

    // Resume listening after delay
    listeningPauseTimeoutRef.current = setTimeout(() => {
      setIsListeningPaused(false)
      chordStartTimeRef.current = Date.now() // Reset timer when listening resumes
    }, durationMs)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined" && !synthesizerRef.current) {
      synthesizerRef.current = new AudioSynthesizer()
    }

    return () => {
      if (synthesizerRef.current) {
        synthesizerRef.current.close()
        synthesizerRef.current = null
      }
      if (listeningPauseTimeoutRef.current) {
        clearTimeout(listeningPauseTimeoutRef.current)
      }
    }
  }, [])

  // Update available chords when difficulty changes
  useEffect(() => {
    const chordNames = CHORD_DIFFICULTIES[difficulty]
    availableChordsRef.current = CHORDS.filter(c => chordNames.includes(c.name))
  }, [difficulty])

  const generateRandomChord = useCallback((): GuitarChord => {
    const chords = availableChordsRef.current
    if (chords.length === 0) {
      // Fallback to easy chords
      const easyChordNames = CHORD_DIFFICULTIES.easy
      const easyChords = CHORDS.filter(c => easyChordNames.includes(c.name))
      return easyChords[Math.floor(Math.random() * easyChords.length)]
    }
    return chords[Math.floor(Math.random() * chords.length)]
  }, [])

  const playCurrentChord = useCallback(async () => {
    if (!currentChord || !synthesizerRef.current) return

    setIsPlayingChord(true)

    // Pause listening to prevent mic from catching the playback
    // Chord plays for ~1.5s, add buffer for reverb/decay
    pauseListeningDuringPlayback(2500)

    try {
      console.log(`🎸 Playing chord: ${currentChord.displayName}`)

      // Play chord notes as an arpeggio
      const frequencies = currentChord.frequencies
      const synth = synthesizerRef.current

      // Play each note with slight delay (arpeggio style)
      for (let i = 0; i < frequencies.length; i++) {
        setTimeout(() => {
          synth.playFrequency(frequencies[i], 400)
        }, i * 80)
      }

      // Also play all together after arpeggio
      setTimeout(() => {
        frequencies.forEach(freq => {
          synth.playFrequency(freq, 800)
        })
      }, frequencies.length * 80 + 200)

    } catch (error) {
      console.error("Error playing chord:", error)
    } finally {
      setTimeout(() => setIsPlayingChord(false), 1500)
    }
  }, [currentChord, pauseListeningDuringPlayback])

  const startGame = useCallback(() => {
    const firstChord = generateRandomChord()
    setCurrentChord(firstChord)
    setPhase("playing")
    setScore(0)
    setLives(3)
    setAttempts([])
    setHitProgress(0)
    setIsHittingChord(false)
    setDetectedNotes([])
    setMatchedNotes([])
    matchedNotesRef.current = new Set()
    detectedNotesRef.current = []
    consecutiveCorrectRef.current = 0
    chordStartTimeRef.current = Date.now()

    trackEvent("chord_game_started", "Game", difficulty)

    // Auto-play the first chord with listening paused
    pauseListeningDuringPlayback(2000)
    setTimeout(() => {
      if (synthesizerRef.current) {
        const frequencies = firstChord.frequencies
        frequencies.forEach((freq, i) => {
          setTimeout(() => {
            synthesizerRef.current?.playFrequency(freq, 600)
          }, i * 100)
        })
      }
    }, 100)
  }, [generateRandomChord, difficulty, pauseListeningDuringPlayback])

  const processPitch = useCallback((pitch: PitchData) => {
    if (phase !== "playing" || !currentChord || isListeningPaused) return

    const detectedNote = pitch.note
    const targetNotes = currentChord.notes

    // Add to detected notes (use ref to avoid re-renders)
    detectedNotesRef.current = [...detectedNotesRef.current.slice(-11), detectedNote]

    // Check if detected note matches any chord note
    const isNoteInChord = targetNotes.includes(detectedNote)

    if (isNoteInChord) {
      matchedNotesRef.current.add(detectedNote)
      consecutiveCorrectRef.current++
    } else {
      // Penalize wrong notes, but be lenient
      consecutiveCorrectRef.current = Math.max(0, consecutiveCorrectRef.current - 2)
    }

    // Update progress
    const progress = Math.min((consecutiveCorrectRef.current / REQUIRED_CONSECUTIVE_HITS) * 100, 100)
    setHitProgress(progress)
    setIsHittingChord(progress > 10)

    // Update display state less frequently (every 5 detections)
    if (consecutiveCorrectRef.current % 5 === 0) {
      setDetectedNotes([...detectedNotesRef.current])
      setMatchedNotes([...matchedNotesRef.current])
    }

    // Check if all notes are matched and we have enough consecutive hits
    const matchedCount = [...matchedNotesRef.current].filter(n => targetNotes.includes(n)).length
    const requiredNotes = Math.ceil(targetNotes.length * 0.6) // Need at least 60% of notes

    if (consecutiveCorrectRef.current >= REQUIRED_CONSECUTIVE_HITS && matchedCount >= requiredNotes) {
      // Success!
      const timeToHit = Date.now() - chordStartTimeRef.current
      const finalMatchedNotes = [...matchedNotesRef.current]

      setAttempts(prev => [...prev, {
        targetChord: currentChord,
        success: true,
        timeToHit,
        detectedNotes: finalMatchedNotes,
      }])

      setScore(prev => prev + 15) // More points for chords
      setPhase("celebrating")
      setHitProgress(100)
      setMatchedNotes(finalMatchedNotes)

      trackEvent("chord_hit", "Game", currentChord.name, Math.round(timeToHit / 1000))

      // Play success sound
      if (synthesizerRef.current) {
        synthesizerRef.current.playSuccessSound()
      }

      // Move to next chord after celebration
      setTimeout(() => {
        const nextChord = generateRandomChord()
        setCurrentChord(nextChord)
        setHitProgress(0)
        setIsHittingChord(false)
        setDetectedNotes([])
        setMatchedNotes([])
        matchedNotesRef.current = new Set()
        detectedNotesRef.current = []
        consecutiveCorrectRef.current = 0
        setPhase("playing")

        // Play next chord with listening paused during playback
        if (synthesizerRef.current) {
          pauseListeningDuringPlayback(2000) // Pause while chord plays
          setTimeout(() => {
            nextChord.frequencies.forEach((freq, i) => {
              setTimeout(() => {
                synthesizerRef.current?.playFrequency(freq, 600)
              }, i * 100)
            })
          }, 200)
        }
      }, 1500)
    }
  }, [phase, currentChord, isListeningPaused, generateRandomChord, pauseListeningDuringPlayback])

  const skipChord = useCallback(() => {
    if (phase !== "playing" || !currentChord) return

    const timeSpent = Date.now() - chordStartTimeRef.current

    setAttempts(prev => [...prev, {
      targetChord: currentChord,
      success: false,
      timeToHit: timeSpent,
      detectedNotes: [...matchedNotesRef.current],
    }])

    const newLives = lives - 1
    setLives(newLives)

    trackEvent("chord_skipped", "Game", currentChord.name)

    if (newLives <= 0) {
      trackEvent("chord_game_over", "Game", undefined, score)
      setPhase("gameover")
    } else {
      // Generate next chord
      const nextChord = generateRandomChord()
      setCurrentChord(nextChord)
      setHitProgress(0)
      setIsHittingChord(false)
      setDetectedNotes([])
      setMatchedNotes([])
      matchedNotesRef.current = new Set()
      detectedNotesRef.current = []
      consecutiveCorrectRef.current = 0

      // Play next chord with listening paused
      if (synthesizerRef.current) {
        pauseListeningDuringPlayback(2000)
        setTimeout(() => {
          nextChord.frequencies.forEach((freq, i) => {
            setTimeout(() => {
              synthesizerRef.current?.playFrequency(freq, 600)
            }, i * 100)
          })
        }, 300)
      }
    }
  }, [phase, currentChord, lives, score, generateRandomChord, pauseListeningDuringPlayback])

  const reset = useCallback(() => {
    setPhase("ready")
    setCurrentChord(null)
    setScore(0)
    setLives(3)
    setAttempts([])
    setHitProgress(0)
    setIsHittingChord(false)
    setDetectedNotes([])
    setMatchedNotes([])
    matchedNotesRef.current = new Set()
    detectedNotesRef.current = []
    consecutiveCorrectRef.current = 0
  }, [])

  return {
    phase,
    currentChord,
    score,
    lives,
    attempts,
    isPlayingChord,
    isListeningPaused,
    hitProgress,
    isHittingChord,
    detectedNotes,
    matchedNotes,
    startGame,
    playCurrentChord,
    processPitch,
    skipChord,
    reset,
  }
}
