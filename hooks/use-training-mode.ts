"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { AudioSynthesizer, type TrainingExercise, type ToneNote } from "@/lib/audio-synth"
import { type PitchData, frequencyToNote, noteToFrequency, getPitchAccuracy } from "@/lib/pitch-detector"

export type TrainingPhase = "selecting" | "listening" | "ready" | "recording" | "results"

export interface NoteAccuracy {
  expectedNote: ToneNote
  actualPitches: PitchData[]
  averageFrequency: number
  averageCents: number
  accuracy: "perfect" | "good" | "off"
  hitRate: number // percentage of time spent in correct note
}

export function useTrainingMode() {
  const [phase, setPhase] = useState<TrainingPhase>("selecting")
  const [selectedExercise, setSelectedExercise] = useState<TrainingExercise | null>(null)
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0)
  const [isPlayingReference, setIsPlayingReference] = useState(false)
  const [isPlayingSingleNote, setIsPlayingSingleNote] = useState(false)
  const [accuracyResults, setAccuracyResults] = useState<NoteAccuracy[]>([])
  const [recordedPitches, setRecordedPitches] = useState<PitchData[]>([])

  const synthesizerRef = useRef<AudioSynthesizer | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const recordedPitchesRef = useRef<PitchData[]>([])

  useEffect(() => {
    // Initialize synthesizer
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

  const selectExercise = useCallback((exercise: TrainingExercise) => {
    setSelectedExercise(exercise)
    setPhase("listening")
    setCurrentNoteIndex(0)
    setAccuracyResults([])
    setRecordedPitches([])
  }, [])

  const playReference = useCallback(async () => {
    if (!selectedExercise || !synthesizerRef.current) return

    setIsPlayingReference(true)
    try {
      const completed = await synthesizerRef.current.playNoteSequence(selectedExercise.notes, 300)
      if (completed) {
        setPhase("ready")
      }
    } catch (error) {
      console.error("Error playing reference:", error)
    } finally {
      setIsPlayingReference(false)
    }
  }, [selectedExercise])

  const playSingleNote = useCallback(async (note: ToneNote) => {
    if (!synthesizerRef.current) return

    setIsPlayingSingleNote(true)
    try {
      await synthesizerRef.current.playNote(note.note, note.octave, note.duration)
    } catch (error) {
      console.error("Error playing single note:", error)
    } finally {
      setIsPlayingSingleNote(false)
    }
  }, [])

  const stopPlaying = useCallback(() => {
    if (!synthesizerRef.current) return
    synthesizerRef.current.stopAllSounds()
    setIsPlayingReference(false)
    setIsPlayingSingleNote(false)
  }, [])

  const startRecording = useCallback(() => {
    setPhase("recording")
    setRecordedPitches([])
    recordedPitchesRef.current = []
    recordingStartTimeRef.current = Date.now()
  }, [])

  const addPitch = useCallback((pitch: PitchData) => {
    if (phase !== "recording") return
    recordedPitchesRef.current = [...recordedPitchesRef.current, pitch]
    setRecordedPitches(recordedPitchesRef.current)
  }, [phase])

  const stopRecording = useCallback(() => {
    if (!selectedExercise) return

    // Analyze the recorded pitches using the ref to avoid stale closure
    const results = analyzeAccuracy(selectedExercise.notes, recordedPitchesRef.current)
    setAccuracyResults(results)
    setPhase("results")
  }, [selectedExercise])

  const reset = useCallback(() => {
    setPhase("selecting")
    setSelectedExercise(null)
    setCurrentNoteIndex(0)
    setAccuracyResults([])
    setRecordedPitches([])
    recordedPitchesRef.current = []
  }, [])

  const retry = useCallback(() => {
    setPhase("listening")
    setCurrentNoteIndex(0)
    setAccuracyResults([])
    setRecordedPitches([])
    recordedPitchesRef.current = []
  }, [])

  return {
    phase,
    selectedExercise,
    currentNoteIndex,
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
  }
}

function analyzeAccuracy(expectedNotes: ToneNote[], recordedPitches: PitchData[]): NoteAccuracy[] {
  if (recordedPitches.length === 0) return []

  const results: NoteAccuracy[] = []
  const totalDuration = expectedNotes.reduce((sum, note) => sum + note.duration, 0)
  const startTime = recordedPitches[0].timestamp
  const endTime = recordedPitches[recordedPitches.length - 1].timestamp
  const actualDuration = endTime - startTime

  let currentTime = 0

  for (const expectedNote of expectedNotes) {
    // Calculate the time window for this note
    const noteStartRatio = currentTime / totalDuration
    const noteEndRatio = (currentTime + expectedNote.duration) / totalDuration
    
    const noteStartTime = startTime + noteStartRatio * actualDuration
    const noteEndTime = startTime + noteEndRatio * actualDuration

    // Find all pitches that fall within this note's time window
    const notePitches = recordedPitches.filter(
      (p) => p.timestamp >= noteStartTime && p.timestamp <= noteEndTime
    )

    if (notePitches.length === 0) {
      results.push({
        expectedNote,
        actualPitches: [],
        averageFrequency: 0,
        averageCents: 0,
        accuracy: "off",
        hitRate: 0,
      })
      currentTime += expectedNote.duration
      continue
    }

    // Calculate the expected frequency
    const expectedFrequency = noteToFrequency(expectedNote.note, expectedNote.octave)

    // Calculate average frequency
    const avgFrequency = notePitches.reduce((sum, p) => sum + p.frequency, 0) / notePitches.length

    // Calculate cents difference from expected note
    const semitonesDiff = 12 * Math.log2(avgFrequency / expectedFrequency)
    const avgCents = Math.round(semitonesDiff * 100)

    // Calculate how many pitches were in the correct note
    let correctPitches = 0
    for (const pitch of notePitches) {
      // Check if the pitch is within 50 cents of the expected note
      const semitones = 12 * Math.log2(pitch.frequency / expectedFrequency)
      const cents = semitones * 100
      if (Math.abs(cents) <= 50) {
        correctPitches++
      }
    }

    const hitRate = (correctPitches / notePitches.length) * 100
    const accuracy = getPitchAccuracy(avgCents)

    results.push({
      expectedNote,
      actualPitches: notePitches,
      averageFrequency: avgFrequency,
      averageCents: avgCents,
      accuracy,
      hitRate,
    })

    currentTime += expectedNote.duration
  }

  return results
}

