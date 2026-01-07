// MIDI Parser for extracting vocal melody notes from .mid files

export interface MidiNote {
  note: string        // e.g., "C", "C#", "D"
  octave: number      // e.g., 4
  midiNumber: number  // MIDI note number (60 = C4)
  startTime: number   // Start time in milliseconds
  duration: number    // Duration in milliseconds
  velocity: number    // 0-127
  channel: number     // MIDI channel 0-15
}

export interface MidiTrack {
  name: string
  channel: number     // Primary channel for this track (-1 if mixed)
  notes: MidiNote[]
}

export interface ParsedMidi {
  name: string
  duration: number    // Total duration in milliseconds
  tempo: number       // BPM
  tracks: MidiTrack[]
  notes: MidiNote[]   // All notes combined and sorted by time
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function midiNumberToNote(midiNumber: number): { note: string; octave: number } {
  const octave = Math.floor(midiNumber / 12) - 1
  const noteIndex = midiNumber % 12
  return {
    note: NOTE_NAMES[noteIndex],
    octave,
  }
}

export function noteToMidiNumber(note: string, octave: number): number {
  const noteIndex = NOTE_NAMES.indexOf(note)
  if (noteIndex === -1) return 60 // Default to C4
  return (octave + 1) * 12 + noteIndex
}

// Read variable length quantity from MIDI data
function readVarLen(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0
  let bytesRead = 0
  let byte: number

  do {
    byte = data[offset + bytesRead]
    value = (value << 7) | (byte & 0x7f)
    bytesRead++
  } while (byte & 0x80 && bytesRead < 4)

  return { value, bytesRead }
}

// Read a big-endian 16-bit integer
function readUint16BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1]
}

// Read a big-endian 32-bit integer
function readUint32BE(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]
}

// Core parser that works with ArrayBuffer
export function parseMidiBuffer(arrayBuffer: ArrayBuffer, fileName: string = "Unknown"): ParsedMidi {
  const data = new Uint8Array(arrayBuffer)

  // Verify MIDI header
  const headerChunk = String.fromCharCode(...data.slice(0, 4))
  if (headerChunk !== "MThd") {
    throw new Error("Invalid MIDI file: Missing MThd header")
  }

  const headerLength = readUint32BE(data, 4)
  const format = readUint16BE(data, 8)
  const numTracks = readUint16BE(data, 10)
  const timeDivision = readUint16BE(data, 12)

  // Time division: ticks per quarter note
  const ticksPerQuarterNote = timeDivision & 0x7fff

  let offset = 8 + headerLength
  const rawTracks: { name: string; notes: Array<MidiNote & { startTick: number; durationTicks: number }> }[] = []
  let tempo = 120 // Default BPM
  
  // Track tempo changes
  const tempoChanges: Array<{ tick: number; tempo: number }> = []

  // Parse each track
  for (let trackIndex = 0; trackIndex < numTracks; trackIndex++) {
    const trackChunk = String.fromCharCode(...data.slice(offset, offset + 4))
    if (trackChunk !== "MTrk") {
      // Skip invalid track
      console.warn(`Invalid track chunk at offset ${offset}, skipping`)
      break
    }

    const trackLength = readUint32BE(data, offset + 4)
    offset += 8

    const trackEnd = offset + trackLength
    let trackOffset = offset
    let currentTick = 0
    let runningStatus = 0

    const notes: Array<MidiNote & { startTick: number; durationTicks: number }> = []
    // Key by noteNumber + channel to handle polyphonic notes on same channel
    const activeNotes: Map<string, { startTick: number; velocity: number; channel: number; noteNumber: number }> = new Map()
    let trackName = `Track ${trackIndex + 1}`

    while (trackOffset < trackEnd) {
      // Read delta time
      const deltaResult = readVarLen(data, trackOffset)
      currentTick += deltaResult.value
      trackOffset += deltaResult.bytesRead

      // Read event
      let eventByte = data[trackOffset]

      // Handle running status
      if (eventByte < 0x80) {
        eventByte = runningStatus
      } else {
        trackOffset++
        if (eventByte < 0xf0) {
          runningStatus = eventByte
        }
      }

      const eventType = eventByte & 0xf0
      const channel = eventByte & 0x0f

      if (eventType === 0x90) {
        // Note On
        const noteNumber = data[trackOffset++]
        const velocity = data[trackOffset++]
        const key = `${channel}-${noteNumber}`

        if (velocity > 0) {
          // Note on
          activeNotes.set(key, { startTick: currentTick, velocity, channel, noteNumber })
        } else {
          // Note off (velocity 0)
          const activeNote = activeNotes.get(key)
          if (activeNote) {
            const { note, octave } = midiNumberToNote(noteNumber)
            notes.push({
              note,
              octave,
              midiNumber: noteNumber,
              startTime: 0, // Will be calculated after tempo
              duration: 0,  // Will be calculated after tempo
              startTick: activeNote.startTick,
              durationTicks: currentTick - activeNote.startTick,
              velocity: activeNote.velocity,
              channel,
            })
            activeNotes.delete(key)
          }
        }
      } else if (eventType === 0x80) {
        // Note Off
        const noteNumber = data[trackOffset++]
        trackOffset++ // Skip velocity
        const key = `${channel}-${noteNumber}`

        const activeNote = activeNotes.get(key)
        if (activeNote) {
          const { note, octave } = midiNumberToNote(noteNumber)
          notes.push({
            note,
            octave,
            midiNumber: noteNumber,
            startTime: 0,
            duration: 0,
            startTick: activeNote.startTick,
            durationTicks: currentTick - activeNote.startTick,
            velocity: activeNote.velocity,
            channel,
          })
          activeNotes.delete(key)
        }
      } else if (eventType === 0xa0) {
        // Aftertouch
        trackOffset += 2
      } else if (eventType === 0xb0) {
        // Control Change
        trackOffset += 2
      } else if (eventType === 0xc0) {
        // Program Change
        trackOffset++
      } else if (eventType === 0xd0) {
        // Channel Pressure
        trackOffset++
      } else if (eventType === 0xe0) {
        // Pitch Bend
        trackOffset += 2
      } else if (eventByte === 0xff) {
        // Meta event
        const metaType = data[trackOffset++]
        const metaLengthResult = readVarLen(data, trackOffset)
        trackOffset += metaLengthResult.bytesRead
        const metaLength = metaLengthResult.value

        if (metaType === 0x03) {
          // Track name
          trackName = String.fromCharCode(...data.slice(trackOffset, trackOffset + metaLength))
        } else if (metaType === 0x51) {
          // Tempo
          const microsecondsPerQuarter =
            (data[trackOffset] << 16) | (data[trackOffset + 1] << 8) | data[trackOffset + 2]
          tempo = Math.round(60000000 / microsecondsPerQuarter)
          tempoChanges.push({ tick: currentTick, tempo })
        }

        trackOffset += metaLength
      } else if (eventByte === 0xf0 || eventByte === 0xf7) {
        // SysEx
        const sysexLengthResult = readVarLen(data, trackOffset)
        trackOffset += sysexLengthResult.bytesRead + sysexLengthResult.value
      }
    }

    if (notes.length > 0) {
      rawTracks.push({ name: trackName, notes })
    }

    offset = trackEnd
  }

  // Use first tempo found or default
  if (tempoChanges.length > 0) {
    tempo = tempoChanges[0].tempo
  }

  // Convert ticks to milliseconds
  const msPerTick = 60000 / (tempo * ticksPerQuarterNote)

  // Process notes and convert times
  const allNotes: MidiNote[] = []
  const channelNotes: Map<number, MidiNote[]> = new Map()

  for (const track of rawTracks) {
    for (const note of track.notes) {
      const processedNote: MidiNote = {
        note: note.note,
        octave: note.octave,
        midiNumber: note.midiNumber,
        startTime: note.startTick * msPerTick,
        duration: note.durationTicks * msPerTick,
        velocity: note.velocity,
        channel: note.channel,
      }
      allNotes.push(processedNote)

      // Group by channel
      if (!channelNotes.has(note.channel)) {
        channelNotes.set(note.channel, [])
      }
      channelNotes.get(note.channel)!.push(processedNote)
    }
  }

  // Sort all notes by start time
  allNotes.sort((a, b) => a.startTime - b.startTime)

  // Create tracks - either from original tracks or split by channel
  let tracks: MidiTrack[] = []

  // Check if we have meaningful track separation
  const tracksWithNotes = rawTracks.filter(t => t.notes.length > 0)
  
  if (tracksWithNotes.length > 1) {
    // Use original track structure
    tracks = tracksWithNotes.map(track => {
      const trackNotes = track.notes.map(n => ({
        note: n.note,
        octave: n.octave,
        midiNumber: n.midiNumber,
        startTime: n.startTick * msPerTick,
        duration: n.durationTicks * msPerTick,
        velocity: n.velocity,
        channel: n.channel,
      }))
      trackNotes.sort((a, b) => a.startTime - b.startTime)
      
      // Determine primary channel
      const channelCounts = new Map<number, number>()
      for (const n of trackNotes) {
        channelCounts.set(n.channel, (channelCounts.get(n.channel) || 0) + 1)
      }
      let primaryChannel = -1
      let maxCount = 0
      channelCounts.forEach((count, ch) => {
        if (count > maxCount) {
          maxCount = count
          primaryChannel = ch
        }
      })
      
      return {
        name: track.name,
        channel: primaryChannel,
        notes: trackNotes,
      }
    })
  } else if (channelNotes.size > 1) {
    // Single track but multiple channels - split by channel
    const channelNames: Record<number, string> = {
      0: "Piano / Keys",
      1: "Chromatic Percussion",
      2: "Organ",
      3: "Guitar",
      4: "Bass",
      5: "Strings",
      6: "Ensemble",
      7: "Brass",
      8: "Reed",
      9: "Drums (Ch 10)",
      10: "Synth Lead",
      11: "Synth Pad",
      12: "Synth Effects",
      13: "Ethnic",
      14: "Percussive",
      15: "Sound Effects",
    }
    
    channelNotes.forEach((notes, channel) => {
      notes.sort((a, b) => a.startTime - b.startTime)
      tracks.push({
        name: `Channel ${channel + 1} - ${channelNames[channel] || "Unknown"}`,
        channel,
        notes,
      })
    })
    
    // Sort tracks by channel number
    tracks.sort((a, b) => a.channel - b.channel)
  } else {
    // Single track, single channel (or no notes)
    if (tracksWithNotes.length === 1) {
      const track = tracksWithNotes[0]
      const trackNotes = track.notes.map(n => ({
        note: n.note,
        octave: n.octave,
        midiNumber: n.midiNumber,
        startTime: n.startTick * msPerTick,
        duration: n.durationTicks * msPerTick,
        velocity: n.velocity,
        channel: n.channel,
      }))
      trackNotes.sort((a, b) => a.startTime - b.startTime)
      tracks.push({
        name: track.name,
        channel: trackNotes[0]?.channel ?? -1,
        notes: trackNotes,
      })
    }
  }

  // Calculate total duration
  const duration =
    allNotes.length > 0
      ? Math.max(...allNotes.map((n) => n.startTime + n.duration))
      : 0

  // Use provided filename
  const name = fileName.replace(".mid", "").replace(".MID", "").replace(".midi", "").replace(".MIDI", "")

  console.log(`Parsed MIDI: ${name}, ${tracks.length} tracks, ${allNotes.length} notes, duration: ${Math.round(duration / 1000)}s`)
  tracks.forEach((t, i) => console.log(`  Track ${i + 1}: "${t.name}" - ${t.notes.length} notes, channel ${t.channel}`))

  return {
    name,
    duration,
    tempo,
    tracks,
    notes: allNotes,
  }
}

// Parse MIDI from URL (fetches and parses)
export async function parseMidiFile(url: string): Promise<ParsedMidi> {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const fileName = url.split("/").pop() || "Unknown"
  return parseMidiBuffer(arrayBuffer, fileName)
}

// Get available MIDI files from public folder
export const AVAILABLE_MIDI_FILES = [
  { id: "wlazl_kotek", name: "Wlazł Kotek na Płotek", url: "/wlazl_kotek_na_plotek.mid" },
]

// Transpose all notes in a MIDI by a number of semitones
export function transposeMidi(midi: ParsedMidi, semitones: number): ParsedMidi {
  if (semitones === 0) return midi

  const transposeNote = (note: MidiNote): MidiNote => {
    const newMidiNumber = note.midiNumber + semitones
    const { note: newNoteName, octave: newOctave } = midiNumberToNote(newMidiNumber)
    return {
      ...note,
      note: newNoteName,
      octave: newOctave,
      midiNumber: newMidiNumber,
    }
  }

  const transposedNotes = midi.notes.map(transposeNote)

  const transposedTracks = midi.tracks.map((track) => ({
    ...track,
    notes: track.notes.map(transposeNote),
  }))

  return {
    ...midi,
    notes: transposedNotes,
    tracks: transposedTracks,
  }
}

// Helper to get octave shift label
export function getTransposeLabel(semitones: number): string {
  if (semitones === 0) return "Oryginał"
  const octaves = Math.floor(Math.abs(semitones) / 12)
  const remaining = Math.abs(semitones) % 12
  
  let label = semitones > 0 ? "+" : "-"
  if (octaves > 0) label += `${octaves} okt`
  if (remaining > 0) label += `${octaves > 0 ? " " : ""}${remaining} półt`
  
  return label
}
