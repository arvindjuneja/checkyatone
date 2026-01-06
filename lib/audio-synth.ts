// Audio synthesis utilities for playing reference tones

import { noteToFrequency } from "./pitch-detector"

export interface ToneNote {
  note: string
  octave: number
  duration: number // in milliseconds
}

export class AudioSynthesizer {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null

  constructor() {
    if (typeof window !== "undefined") {
      this.audioContext = new AudioContext()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.gain.value = 0.3 // Master volume
      this.masterGain.connect(this.audioContext.destination)
    }
  }

  async playTone(frequency: number, duration: number, delay: number = 0): Promise<void> {
    if (!this.audioContext || !this.masterGain) return

    const startTime = this.audioContext.currentTime + delay
    const endTime = startTime + duration / 1000

    // Create oscillator for the main tone
    const oscillator = this.audioContext.createOscillator()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency

    // Create gain node for envelope
    const gainNode = this.audioContext.createGain()
    gainNode.gain.value = 0

    // Attack-Decay-Sustain-Release envelope
    const attackTime = 0.05
    const decayTime = 0.05
    const sustainLevel = 0.7
    const releaseTime = 0.1

    gainNode.gain.setValueAtTime(0, startTime)
    gainNode.gain.linearRampToValueAtTime(1, startTime + attackTime)
    gainNode.gain.linearRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime)
    gainNode.gain.setValueAtTime(sustainLevel, endTime - releaseTime)
    gainNode.gain.linearRampToValueAtTime(0, endTime)

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.start(startTime)
    oscillator.stop(endTime)

    return new Promise((resolve) => {
      setTimeout(resolve, delay + duration)
    })
  }

  async playNoteSequence(notes: ToneNote[], gap: number = 200): Promise<void> {
    let currentDelay = 0

    for (const noteData of notes) {
      const frequency = noteToFrequency(noteData.note, noteData.octave)
      if (frequency > 0) {
        await this.playTone(frequency, noteData.duration, currentDelay / 1000)
        currentDelay += noteData.duration + gap
      }
    }
  }

  async playNote(note: string, octave: number, duration: number = 500): Promise<void> {
    const frequency = noteToFrequency(note, octave)
    if (frequency > 0) {
      await this.playTone(frequency, duration)
    }
  }

  close() {
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
      this.masterGain = null
    }
  }
}

// Training exercise definitions
export interface TrainingExercise {
  id: string
  name: string
  description: string
  notes: ToneNote[]
}

export const TRAINING_EXERCISES: TrainingExercise[] = [
  {
    id: "c-major-scale-up",
    name: "Gama C-dur w górę",
    description: "Zaśpiewaj gamę C-dur od C4 do C5",
    notes: [
      { note: "C", octave: 4, duration: 600 },
      { note: "D", octave: 4, duration: 600 },
      { note: "E", octave: 4, duration: 600 },
      { note: "F", octave: 4, duration: 600 },
      { note: "G", octave: 4, duration: 600 },
      { note: "A", octave: 4, duration: 600 },
      { note: "B", octave: 4, duration: 600 },
      { note: "C", octave: 5, duration: 800 },
    ],
  },
  {
    id: "c-major-scale-down",
    name: "Gama C-dur w dół",
    description: "Zaśpiewaj gamę C-dur od C5 do C4",
    notes: [
      { note: "C", octave: 5, duration: 600 },
      { note: "B", octave: 4, duration: 600 },
      { note: "A", octave: 4, duration: 600 },
      { note: "G", octave: 4, duration: 600 },
      { note: "F", octave: 4, duration: 600 },
      { note: "E", octave: 4, duration: 600 },
      { note: "D", octave: 4, duration: 600 },
      { note: "C", octave: 4, duration: 800 },
    ],
  },
  {
    id: "a-minor-scale",
    name: "Gama a-moll",
    description: "Zaśpiewaj gamę a-moll naturalną",
    notes: [
      { note: "A", octave: 4, duration: 600 },
      { note: "B", octave: 4, duration: 600 },
      { note: "C", octave: 5, duration: 600 },
      { note: "D", octave: 5, duration: 600 },
      { note: "E", octave: 5, duration: 600 },
      { note: "F", octave: 5, duration: 600 },
      { note: "G", octave: 5, duration: 600 },
      { note: "A", octave: 5, duration: 800 },
    ],
  },
  {
    id: "c-major-arpeggio",
    name: "Arpeggio C-dur",
    description: "Zaśpiewaj arpeggio akordu C-dur",
    notes: [
      { note: "C", octave: 4, duration: 600 },
      { note: "E", octave: 4, duration: 600 },
      { note: "G", octave: 4, duration: 600 },
      { note: "C", octave: 5, duration: 800 },
    ],
  },
  {
    id: "perfect-fifth",
    name: "Kwinta czysta",
    description: "Zaśpiewaj kwintę czystą (C-G)",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "G", octave: 4, duration: 800 },
    ],
  },
  {
    id: "perfect-fourth",
    name: "Kwarta czysta",
    description: "Zaśpiewaj kwartę czystą (C-F)",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "F", octave: 4, duration: 800 },
    ],
  },
  {
    id: "major-third",
    name: "Tercja wielka",
    description: "Zaśpiewaj tercję wielką (C-E)",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "E", octave: 4, duration: 800 },
    ],
  },
  {
    id: "octave-jump",
    name: "Skok oktawowy",
    description: "Zaśpiewaj oktawę (C4-C5)",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "C", octave: 5, duration: 800 },
    ],
  },
]

