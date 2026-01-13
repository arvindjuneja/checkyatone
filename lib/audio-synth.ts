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
      this.masterGain.gain.value = 0.85 // Master volume
      this.masterGain.connect(this.audioContext.destination)
    }
  }

  // Piano-like tone with harmonics for rich, audible sound
  async playPianoTone(frequency: number, duration: number, delay: number = 0): Promise<void> {
    if (!this.audioContext || !this.masterGain) return

    const startTime = this.audioContext.currentTime + delay
    const endTime = startTime + duration / 1000

    // Harmonic structure for piano-like sound
    // Fundamental + overtones with decreasing amplitude
    const harmonics = [
      { ratio: 1, gain: 1.0 },      // Fundamental
      { ratio: 2, gain: 0.5 },      // 2nd harmonic (octave)
      { ratio: 3, gain: 0.25 },     // 3rd harmonic
      { ratio: 4, gain: 0.15 },     // 4th harmonic
      { ratio: 5, gain: 0.08 },     // 5th harmonic
    ]

    // Create a mixer for all harmonics
    const mixerGain = this.audioContext.createGain()
    mixerGain.gain.value = 0.6

    // Piano-like ADSR envelope
    const attackTime = 0.01  // Fast attack like piano hammer
    const decayTime = 0.3    // Quick decay
    const sustainLevel = 0.4 // Lower sustain
    const releaseTime = 0.2

    // Create envelope gain
    const envelopeGain = this.audioContext.createGain()
    envelopeGain.gain.setValueAtTime(0, startTime)
    envelopeGain.gain.linearRampToValueAtTime(1, startTime + attackTime)
    envelopeGain.gain.exponentialRampToValueAtTime(sustainLevel, startTime + attackTime + decayTime)
    envelopeGain.gain.setValueAtTime(sustainLevel, endTime - releaseTime)
    envelopeGain.gain.exponentialRampToValueAtTime(0.001, endTime)

    // Create oscillators for each harmonic
    const oscillators: OscillatorNode[] = []
    
    for (const harmonic of harmonics) {
      const osc = this.audioContext.createOscillator()
      osc.type = "sine"
      osc.frequency.value = frequency * harmonic.ratio
      
      const harmonicGain = this.audioContext.createGain()
      harmonicGain.gain.value = harmonic.gain
      
      osc.connect(harmonicGain)
      harmonicGain.connect(mixerGain)
      oscillators.push(osc)
    }

    mixerGain.connect(envelopeGain)
    envelopeGain.connect(this.masterGain)

    // Start and stop all oscillators
    oscillators.forEach(osc => {
      osc.start(startTime)
      osc.stop(endTime + 0.1)
    })

    return new Promise((resolve) => {
      setTimeout(resolve, delay + duration)
    })
  }

  // Legacy simple tone (kept for compatibility)
  async playTone(frequency: number, duration: number, delay: number = 0): Promise<void> {
    return this.playPianoTone(frequency, duration, delay)
  }

  async playNoteSequence(notes: ToneNote[], gap: number = 200): Promise<void> {
    let currentDelay = 0

    console.log('[AudioSynth] Playing note sequence:')
    for (const noteData of notes) {
      const frequency = noteToFrequency(noteData.note, noteData.octave)
      console.log(`  ${noteData.note}${noteData.octave} → ${frequency.toFixed(2)} Hz`)
      if (frequency > 0) {
        await this.playPianoTone(frequency, noteData.duration, currentDelay / 1000)
        currentDelay += noteData.duration + gap
      }
    }
  }

  async playNote(note: string, octave: number, duration: number = 500): Promise<void> {
    const frequency = noteToFrequency(note, octave)
    if (frequency > 0) {
      await this.playPianoTone(frequency, duration)
    }
  }

  // Success fanfare! 🎉
  async playSuccessSound(): Promise<void> {
    if (!this.audioContext || !this.masterGain) return

    const now = this.audioContext.currentTime
    
    // Triumphant ascending arpeggio (C-E-G-C)
    const notes = [
      { freq: 523.25, time: 0, duration: 0.12 },      // C5
      { freq: 659.25, time: 0.08, duration: 0.12 },   // E5
      { freq: 783.99, time: 0.16, duration: 0.12 },   // G5
      { freq: 1046.50, time: 0.24, duration: 0.3 },   // C6 (longer finale)
    ]

    for (const note of notes) {
      const startTime = now + note.time
      const endTime = startTime + note.duration

      // Bright, sparkly sound with harmonics
      const oscillators: OscillatorNode[] = []
      const mixerGain = this.audioContext.createGain()
      mixerGain.gain.value = 0.4

      // Create main tone + harmonics
      const harmonics = [
        { ratio: 1, gain: 1.0 },
        { ratio: 2, gain: 0.6 },
        { ratio: 3, gain: 0.3 },
      ]

      for (const h of harmonics) {
        const osc = this.audioContext.createOscillator()
        osc.type = "sine"
        osc.frequency.value = note.freq * h.ratio
        
        const hGain = this.audioContext.createGain()
        hGain.gain.value = h.gain
        
        osc.connect(hGain)
        hGain.connect(mixerGain)
        oscillators.push(osc)
      }

      // Quick attack envelope
      const envGain = this.audioContext.createGain()
      envGain.gain.setValueAtTime(0, startTime)
      envGain.gain.linearRampToValueAtTime(1, startTime + 0.01)
      envGain.gain.exponentialRampToValueAtTime(0.001, endTime)

      mixerGain.connect(envGain)
      envGain.connect(this.masterGain)

      oscillators.forEach(osc => {
        osc.start(startTime)
        osc.stop(endTime + 0.05)
      })
    }

    return new Promise(resolve => setTimeout(resolve, 550))
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
export type DifficultyLevel = "easy" | "medium" | "hard"

export interface TrainingExercise {
  id: string
  name: string
  description: string
  notes: ToneNote[]
  difficulty: DifficultyLevel
}

export const TRAINING_EXERCISES: TrainingExercise[] = [
  {
    id: "c-major-scale-up",
    name: "Gama C-dur w górę",
    description: "Zaśpiewaj gamę C-dur od C4 do C5",
    difficulty: "hard",
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
    difficulty: "hard",
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
    difficulty: "hard",
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
    difficulty: "medium",
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
    difficulty: "medium",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "G", octave: 4, duration: 800 },
    ],
  },
  {
    id: "perfect-fourth",
    name: "Kwarta czysta",
    description: "Zaśpiewaj kwartę czystą (C-F)",
    difficulty: "easy",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "F", octave: 4, duration: 800 },
    ],
  },
  {
    id: "major-third",
    name: "Tercja wielka",
    description: "Zaśpiewaj tercję wielką (C-E)",
    difficulty: "easy",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "E", octave: 4, duration: 800 },
    ],
  },
  {
    id: "octave-jump",
    name: "Skok oktawowy",
    description: "Zaśpiewaj oktawę (C4-C5)",
    difficulty: "medium",
    notes: [
      { note: "C", octave: 4, duration: 800 },
      { note: "C", octave: 5, duration: 800 },
    ],
  },
]

export function getDifficultyLabel(difficulty: DifficultyLevel): string {
  const labels = {
    easy: "Łatwy",
    medium: "Średni",
    hard: "Trudny",
  }
  return labels[difficulty]
}

export function getDifficultyColor(difficulty: DifficultyLevel): string {
  const colors = {
    easy: "text-pitch-perfect",
    medium: "text-pitch-good",
    hard: "text-pitch-off",
  }
  return colors[difficulty]
}
