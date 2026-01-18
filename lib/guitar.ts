// Guitar tunings and chord definitions

export interface GuitarString {
  name: string
  note: string
  octave: number
  frequency: number
}

export interface GuitarTuning {
  id: string
  name: string
  strings: GuitarString[] // From low to high (6 to 1)
}

export interface GuitarChord {
  name: string
  displayName: string
  frets: (number | null)[] // null = don't play, 0 = open, 1+ = fret number
  fingers?: number[] // Which finger to use
  barreAt?: number // Barre chord position
  notes: string[] // Notes that should be heard
  frequencies: number[] // Expected frequencies
}

// Standard tuning frequencies (A4 = 440Hz)
export const TUNINGS: GuitarTuning[] = [
  {
    id: "standard",
    name: "Standard (EADGBE)",
    strings: [
      { name: "6th (Low E)", note: "E", octave: 2, frequency: 82.41 },
      { name: "5th (A)", note: "A", octave: 2, frequency: 110.00 },
      { name: "4th (D)", note: "D", octave: 3, frequency: 146.83 },
      { name: "3rd (G)", note: "G", octave: 3, frequency: 196.00 },
      { name: "2nd (B)", note: "B", octave: 3, frequency: 246.94 },
      { name: "1st (High E)", note: "E", octave: 4, frequency: 329.63 },
    ],
  },
  {
    id: "drop-d",
    name: "Drop D (DADGBE)",
    strings: [
      { name: "6th (Low D)", note: "D", octave: 2, frequency: 73.42 },
      { name: "5th (A)", note: "A", octave: 2, frequency: 110.00 },
      { name: "4th (D)", note: "D", octave: 3, frequency: 146.83 },
      { name: "3rd (G)", note: "G", octave: 3, frequency: 196.00 },
      { name: "2nd (B)", note: "B", octave: 3, frequency: 246.94 },
      { name: "1st (High E)", note: "E", octave: 4, frequency: 329.63 },
    ],
  },
  {
    id: "half-step-down",
    name: "Half Step Down (Eb)",
    strings: [
      { name: "6th (Eb)", note: "D#", octave: 2, frequency: 77.78 },
      { name: "5th (Ab)", note: "G#", octave: 2, frequency: 103.83 },
      { name: "4th (Db)", note: "C#", octave: 3, frequency: 138.59 },
      { name: "3rd (Gb)", note: "F#", octave: 3, frequency: 185.00 },
      { name: "2nd (Bb)", note: "A#", octave: 3, frequency: 233.08 },
      { name: "1st (Eb)", note: "D#", octave: 4, frequency: 311.13 },
    ],
  },
  {
    id: "open-g",
    name: "Open G (DGDGBD)",
    strings: [
      { name: "6th (D)", note: "D", octave: 2, frequency: 73.42 },
      { name: "5th (G)", note: "G", octave: 2, frequency: 98.00 },
      { name: "4th (D)", note: "D", octave: 3, frequency: 146.83 },
      { name: "3rd (G)", note: "G", octave: 3, frequency: 196.00 },
      { name: "2nd (B)", note: "B", octave: 3, frequency: 246.94 },
      { name: "1st (D)", note: "D", octave: 4, frequency: 293.66 },
    ],
  },
  {
    id: "open-d",
    name: "Open D (DADF#AD)",
    strings: [
      { name: "6th (D)", note: "D", octave: 2, frequency: 73.42 },
      { name: "5th (A)", note: "A", octave: 2, frequency: 110.00 },
      { name: "4th (D)", note: "D", octave: 3, frequency: 146.83 },
      { name: "3rd (F#)", note: "F#", octave: 3, frequency: 185.00 },
      { name: "2nd (A)", note: "A", octave: 3, frequency: 220.00 },
      { name: "1st (D)", note: "D", octave: 4, frequency: 293.66 },
    ],
  },
  {
    id: "dadgad",
    name: "DADGAD",
    strings: [
      { name: "6th (D)", note: "D", octave: 2, frequency: 73.42 },
      { name: "5th (A)", note: "A", octave: 2, frequency: 110.00 },
      { name: "4th (D)", note: "D", octave: 3, frequency: 146.83 },
      { name: "3rd (G)", note: "G", octave: 3, frequency: 196.00 },
      { name: "2nd (A)", note: "A", octave: 3, frequency: 220.00 },
      { name: "1st (D)", note: "D", octave: 4, frequency: 293.66 },
    ],
  },
]

// Common guitar chords (standard tuning)
export const CHORDS: GuitarChord[] = [
  // Open chords - Major
  {
    name: "C",
    displayName: "C Major",
    frets: [null, 3, 2, 0, 1, 0],
    notes: ["C", "E", "G"],
    frequencies: [130.81, 164.81, 196.00, 261.63, 329.63],
  },
  {
    name: "D",
    displayName: "D Major",
    frets: [null, null, 0, 2, 3, 2],
    notes: ["D", "F#", "A"],
    frequencies: [146.83, 220.00, 293.66, 369.99],
  },
  {
    name: "E",
    displayName: "E Major",
    frets: [0, 2, 2, 1, 0, 0],
    notes: ["E", "G#", "B"],
    frequencies: [82.41, 123.47, 164.81, 207.65, 246.94, 329.63],
  },
  {
    name: "G",
    displayName: "G Major",
    frets: [3, 2, 0, 0, 0, 3],
    notes: ["G", "B", "D"],
    frequencies: [98.00, 123.47, 146.83, 196.00, 246.94, 392.00],
  },
  {
    name: "A",
    displayName: "A Major",
    frets: [null, 0, 2, 2, 2, 0],
    notes: ["A", "C#", "E"],
    frequencies: [110.00, 164.81, 220.00, 277.18, 329.63],
  },
  // Open chords - Minor
  {
    name: "Am",
    displayName: "A Minor",
    frets: [null, 0, 2, 2, 1, 0],
    notes: ["A", "C", "E"],
    frequencies: [110.00, 164.81, 220.00, 261.63, 329.63],
  },
  {
    name: "Dm",
    displayName: "D Minor",
    frets: [null, null, 0, 2, 3, 1],
    notes: ["D", "F", "A"],
    frequencies: [146.83, 220.00, 293.66, 349.23],
  },
  {
    name: "Em",
    displayName: "E Minor",
    frets: [0, 2, 2, 0, 0, 0],
    notes: ["E", "G", "B"],
    frequencies: [82.41, 123.47, 164.81, 196.00, 246.94, 329.63],
  },
  // 7th chords
  {
    name: "A7",
    displayName: "A7",
    frets: [null, 0, 2, 0, 2, 0],
    notes: ["A", "C#", "E", "G"],
    frequencies: [110.00, 164.81, 196.00, 277.18, 329.63],
  },
  {
    name: "D7",
    displayName: "D7",
    frets: [null, null, 0, 2, 1, 2],
    notes: ["D", "F#", "A", "C"],
    frequencies: [146.83, 220.00, 261.63, 369.99],
  },
  {
    name: "E7",
    displayName: "E7",
    frets: [0, 2, 0, 1, 0, 0],
    notes: ["E", "G#", "B", "D"],
    frequencies: [82.41, 123.47, 146.83, 207.65, 246.94, 329.63],
  },
  {
    name: "G7",
    displayName: "G7",
    frets: [3, 2, 0, 0, 0, 1],
    notes: ["G", "B", "D", "F"],
    frequencies: [98.00, 123.47, 146.83, 196.00, 246.94, 349.23],
  },
  // Barre chords
  {
    name: "F",
    displayName: "F Major",
    frets: [1, 3, 3, 2, 1, 1],
    barreAt: 1,
    notes: ["F", "A", "C"],
    frequencies: [87.31, 130.81, 174.61, 220.00, 261.63, 349.23],
  },
  {
    name: "Bm",
    displayName: "B Minor",
    frets: [null, 2, 4, 4, 3, 2],
    barreAt: 2,
    notes: ["B", "D", "F#"],
    frequencies: [123.47, 185.00, 246.94, 293.66, 369.99],
  },
]

// Get chord by name
export function getChord(name: string): GuitarChord | undefined {
  return CHORDS.find(c => c.name.toLowerCase() === name.toLowerCase())
}

// Get tuning by id
export function getTuning(id: string): GuitarTuning | undefined {
  return TUNINGS.find(t => t.id === id)
}

// Calculate cents difference between two frequencies
export function getCentsDifference(detected: number, target: number): number {
  return 1200 * Math.log2(detected / target)
}

// Check if frequency is in tune (within tolerance)
export function isInTune(detected: number, target: number, toleranceCents: number = 10): boolean {
  const cents = Math.abs(getCentsDifference(detected, target))
  return cents <= toleranceCents
}

// Get tuning status
export function getTuningStatus(detected: number, target: number): "flat" | "sharp" | "in-tune" {
  const cents = getCentsDifference(detected, target)
  if (Math.abs(cents) <= 10) return "in-tune"
  return cents < 0 ? "flat" : "sharp"
}

// Play a tone at given frequency using Web Audio API
export function playTone(
  frequency: number,
  duration: number = 1.5,
  type: OscillatorType = "sine"
): { stop: () => void } {
  const audioContext = new AudioContext()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.type = type
  oscillator.frequency.value = frequency

  // Envelope for natural sound
  gainNode.gain.setValueAtTime(0, audioContext.currentTime)
  gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)

  oscillator.start()
  oscillator.stop(audioContext.currentTime + duration)

  return {
    stop: () => {
      try {
        oscillator.stop()
        audioContext.close()
      } catch {
        // Already stopped
      }
    },
  }
}

// Play guitar string sound (more realistic with harmonics)
export function playGuitarString(frequency: number, duration: number = 2): { stop: () => void } {
  const audioContext = new AudioContext()
  const masterGain = audioContext.createGain()
  masterGain.connect(audioContext.destination)

  const oscillators: OscillatorNode[] = []

  // Fundamental + harmonics for guitar-like sound
  const harmonics = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.5 },
    { ratio: 3, gain: 0.25 },
    { ratio: 4, gain: 0.125 },
  ]

  harmonics.forEach(({ ratio, gain }) => {
    const osc = audioContext.createOscillator()
    const oscGain = audioContext.createGain()

    osc.type = "triangle"
    osc.frequency.value = frequency * ratio
    oscGain.gain.value = gain * 0.2

    osc.connect(oscGain)
    oscGain.connect(masterGain)

    osc.start()
    oscillators.push(osc)
  })

  // Envelope
  masterGain.gain.setValueAtTime(0.5, audioContext.currentTime)
  masterGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)

  // Stop after duration
  setTimeout(() => {
    oscillators.forEach(osc => {
      try {
        osc.stop()
      } catch {
        // Already stopped
      }
    })
    audioContext.close()
  }, duration * 1000)

  return {
    stop: () => {
      oscillators.forEach(osc => {
        try {
          osc.stop()
        } catch {
          // Already stopped
        }
      })
      audioContext.close()
    },
  }
}

// Difficulty levels for Hit the Chord game
export const CHORD_DIFFICULTIES = {
  easy: ["C", "G", "D", "Em", "Am"],
  medium: ["C", "G", "D", "A", "E", "Em", "Am", "Dm"],
  hard: ["C", "G", "D", "A", "E", "F", "Em", "Am", "Dm", "Bm", "A7", "D7", "E7", "G7"],
}
