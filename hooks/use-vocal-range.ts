"use client"

import { useMemo } from "react"
import { type PitchData } from "@/lib/pitch-detector"

export interface VocalRange {
  lowestNote: string
  lowestOctave: number
  lowestFrequency: number
  highestNote: string
  highestOctave: number
  highestFrequency: number
  rangeInSemitones: number
  voiceType?: string
}

const VOICE_TYPES = [
  { name: "Bass", low: "E2", high: "E4", lowMidi: 40, highMidi: 64 },
  { name: "Baritone", low: "A2", high: "A4", lowMidi: 45, highMidi: 69 },
  { name: "Tenor", low: "C3", high: "C5", lowMidi: 48, highMidi: 72 },
  { name: "Alto", low: "F3", high: "F5", lowMidi: 53, highMidi: 77 },
  { name: "Mezzo-Soprano", low: "A3", high: "A5", lowMidi: 57, highMidi: 81 },
  { name: "Soprano", low: "C4", high: "C6", lowMidi: 60, highMidi: 84 },
]

function noteToMidiNumber(note: string, octave: number): number {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  const noteIndex = NOTE_NAMES.indexOf(note)
  return (octave + 1) * 12 + noteIndex
}

function suggestVoiceType(lowestMidi: number, highestMidi: number): string | undefined {
  const rangeMidi = highestMidi - lowestMidi

  // Find voice types where the user's range overlaps significantly
  const matches = VOICE_TYPES.filter(type => {
    const overlapLow = Math.max(lowestMidi, type.lowMidi)
    const overlapHigh = Math.min(highestMidi, type.highMidi)
    const overlap = overlapHigh - overlapLow

    // If at least 50% of the user's range overlaps with this voice type
    return overlap > 0 && overlap >= rangeMidi * 0.5
  })

  if (matches.length === 0) return undefined

  // Return the voice type with best overlap
  return matches[0].name
}

export function useVocalRange(pitchHistory: PitchData[]): VocalRange | null {
  return useMemo(() => {
    if (pitchHistory.length === 0) return null

    // Filter out outliers - only include pitches with reasonable confidence
    const validPitches = pitchHistory.filter(p => p.confidence > 0.9)

    if (validPitches.length === 0) return null

    // Find lowest and highest notes
    let lowestPitch = validPitches[0]
    let highestPitch = validPitches[0]

    for (const pitch of validPitches) {
      if (pitch.frequency < lowestPitch.frequency) {
        lowestPitch = pitch
      }
      if (pitch.frequency > highestPitch.frequency) {
        highestPitch = pitch
      }
    }

    // Calculate range in semitones
    const lowestMidi = noteToMidiNumber(lowestPitch.note, lowestPitch.octave)
    const highestMidi = noteToMidiNumber(highestPitch.note, highestPitch.octave)
    const rangeInSemitones = highestMidi - lowestMidi

    // Suggest voice type
    const voiceType = suggestVoiceType(lowestMidi, highestMidi)

    return {
      lowestNote: lowestPitch.note,
      lowestOctave: lowestPitch.octave,
      lowestFrequency: lowestPitch.frequency,
      highestNote: highestPitch.note,
      highestOctave: highestPitch.octave,
      highestFrequency: highestPitch.frequency,
      rangeInSemitones,
      voiceType,
    }
  }, [pitchHistory])
}

export function getVocalRangeFromSessions(sessions: any[]): VocalRange | null {
  const allPitches: PitchData[] = []

  for (const session of sessions) {
    if (session.pitchHistory) {
      allPitches.push(...session.pitchHistory)
    }
  }

  if (allPitches.length === 0) return null

  // Use the same logic as above
  const validPitches = allPitches.filter(p => p.confidence > 0.9)

  if (validPitches.length === 0) return null

  let lowestPitch = validPitches[0]
  let highestPitch = validPitches[0]

  for (const pitch of validPitches) {
    if (pitch.frequency < lowestPitch.frequency) {
      lowestPitch = pitch
    }
    if (pitch.frequency > highestPitch.frequency) {
      highestPitch = pitch
    }
  }

  const lowestMidi = noteToMidiNumber(lowestPitch.note, lowestPitch.octave)
  const highestMidi = noteToMidiNumber(highestPitch.note, highestPitch.octave)
  const rangeInSemitones = highestMidi - lowestMidi
  const voiceType = suggestVoiceType(lowestMidi, highestMidi)

  return {
    lowestNote: lowestPitch.note,
    lowestOctave: lowestPitch.octave,
    lowestFrequency: lowestPitch.frequency,
    highestNote: highestPitch.note,
    highestOctave: highestPitch.octave,
    highestFrequency: highestPitch.frequency,
    rangeInSemitones,
    voiceType,
  }
}
