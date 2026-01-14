// Multi-track project storage using IndexedDB

const DB_NAME = "vocal-coach-multitrack"
const DB_VERSION = 2 // Bumped for timeline data models
const PROJECTS_STORE = "projects"
const TRACKS_STORE = "tracks"
const AUDIO_SOURCES_STORE = "audioSources"
const CLIPS_STORE = "clips"

// Audio clip on the timeline
export interface AudioClip {
  id: string
  trackId: string
  audioSourceId: string // Reference to the actual audio data

  // Position and timing
  startTime: number // Position on timeline (in seconds)
  duration: number // Clip duration (in seconds)

  // Trimming (non-destructive)
  trimStart: number // Offset from start of audio (in seconds)
  trimEnd: number // Offset from end of audio (in seconds)

  // Visual
  name: string
  color?: string // Override track color

  // Metadata
  createdAt: number
}

// Shared audio source (multiple clips can reference same audio)
export interface AudioSource {
  id: string
  projectId: string
  name: string
  audioBlob: Blob
  duration: number // Cached duration in seconds
  waveformData?: number[] // Cached waveform for performance
  createdAt: number
}

// Timeline view state
export interface TimelineState {
  // View state
  pixelsPerSecond: number // Horizontal zoom level (default: 100)
  scrollX: number // Horizontal scroll position (in pixels)
  scrollY: number // Vertical scroll position (in pixels)

  // Grid/snap
  snapEnabled: boolean
  snapInterval: number // In seconds (0.1, 0.5, 1, etc.)

  // Selection
  selectedClipIds: string[]

  // Playback
  loopEnabled: boolean
  loopStart: number
  loopEnd: number
}

// Legacy Track interface (for backward compatibility with mixer view)
export interface Track {
  id: string
  projectId: string
  name: string
  audioBlob: Blob
  volume: number // 0-1
  pan: number // -1 to 1 (left to right)
  mute: boolean
  solo: boolean
  color: string
  order: number
  timestamp: number

  // Timeline additions
  height?: number // Track lane height in pixels (default: 100)
  clips?: string[] // Array of clip IDs (for timeline mode)
}

export interface MultiTrackProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  masterVolume: number
  trackIds: string[] // Array of track IDs in order

  // Timeline additions
  timelineState?: TimelineState
  useTimeline?: boolean // Toggle between mixer and timeline view
}

class MultiTrackStorageDB {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("IndexedDB not available"))
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create projects store
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, { keyPath: "id" })
        }

        // Create tracks store
        if (!db.objectStoreNames.contains(TRACKS_STORE)) {
          const trackStore = db.createObjectStore(TRACKS_STORE, { keyPath: "id" })
          // Index by projectId for efficient querying
          trackStore.createIndex("projectId", "projectId", { unique: false })
        }

        // Create audio sources store
        if (!db.objectStoreNames.contains(AUDIO_SOURCES_STORE)) {
          const sourceStore = db.createObjectStore(AUDIO_SOURCES_STORE, { keyPath: "id" })
          sourceStore.createIndex("projectId", "projectId", { unique: false })
        }

        // Create clips store
        if (!db.objectStoreNames.contains(CLIPS_STORE)) {
          const clipStore = db.createObjectStore(CLIPS_STORE, { keyPath: "id" })
          clipStore.createIndex("trackId", "trackId", { unique: false })
          clipStore.createIndex("audioSourceId", "audioSourceId", { unique: false })
        }
      }
    })
  }

  // Project operations
  async saveProject(project: MultiTrackProject): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE], "readwrite")
      const store = transaction.objectStore(PROJECTS_STORE)
      const request = store.put(project)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getProject(projectId: string): Promise<MultiTrackProject | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE], "readonly")
      const store = transaction.objectStore(PROJECTS_STORE)
      const request = store.get(projectId)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllProjects(): Promise<MultiTrackProject[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([PROJECTS_STORE], "readonly")
      const store = transaction.objectStore(PROJECTS_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise(async (resolve, reject) => {
      try {
        // Delete all tracks first
        const tracks = await this.getProjectTracks(projectId)
        for (const track of tracks) {
          await this.deleteTrack(track.id)
        }

        // Then delete the project
        const transaction = this.db!.transaction([PROJECTS_STORE], "readwrite")
        const store = transaction.objectStore(PROJECTS_STORE)
        const request = store.delete(projectId)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      } catch (error) {
        reject(error)
      }
    })
  }

  // Track operations
  async saveTrack(track: Track): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TRACKS_STORE], "readwrite")
      const store = transaction.objectStore(TRACKS_STORE)
      const request = store.put(track)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getTrack(trackId: string): Promise<Track | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TRACKS_STORE], "readonly")
      const store = transaction.objectStore(TRACKS_STORE)
      const request = store.get(trackId)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async getProjectTracks(projectId: string): Promise<Track[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TRACKS_STORE], "readonly")
      const store = transaction.objectStore(TRACKS_STORE)
      const index = store.index("projectId")
      const request = index.getAll(projectId)

      request.onsuccess = () => {
        // Sort by order
        const tracks = request.result.sort((a, b) => a.order - b.order)
        resolve(tracks)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteTrack(trackId: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([TRACKS_STORE], "readwrite")
      const store = transaction.objectStore(TRACKS_STORE)
      const request = store.delete(trackId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // AudioSource operations
  async saveAudioSource(source: AudioSource): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([AUDIO_SOURCES_STORE], "readwrite")
      const store = transaction.objectStore(AUDIO_SOURCES_STORE)
      const request = store.put(source)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getAudioSource(sourceId: string): Promise<AudioSource | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([AUDIO_SOURCES_STORE], "readonly")
      const store = transaction.objectStore(AUDIO_SOURCES_STORE)
      const request = store.get(sourceId)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async getProjectAudioSources(projectId: string): Promise<AudioSource[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([AUDIO_SOURCES_STORE], "readonly")
      const store = transaction.objectStore(AUDIO_SOURCES_STORE)
      const index = store.index("projectId")
      const request = index.getAll(projectId)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async deleteAudioSource(sourceId: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([AUDIO_SOURCES_STORE], "readwrite")
      const store = transaction.objectStore(AUDIO_SOURCES_STORE)
      const request = store.delete(sourceId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // AudioClip operations
  async saveClip(clip: AudioClip): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CLIPS_STORE], "readwrite")
      const store = transaction.objectStore(CLIPS_STORE)
      const request = store.put(clip)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getClip(clipId: string): Promise<AudioClip | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CLIPS_STORE], "readonly")
      const store = transaction.objectStore(CLIPS_STORE)
      const request = store.get(clipId)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async getTrackClips(trackId: string): Promise<AudioClip[]> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CLIPS_STORE], "readonly")
      const store = transaction.objectStore(CLIPS_STORE)
      const index = store.index("trackId")
      const request = index.getAll(trackId)

      request.onsuccess = () => {
        // Sort by start time
        const clips = request.result.sort((a, b) => a.startTime - b.startTime)
        resolve(clips)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteClip(clipId: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CLIPS_STORE], "readwrite")
      const store = transaction.objectStore(CLIPS_STORE)
      const request = store.delete(clipId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

// Singleton instance
export const multiTrackStorage = new MultiTrackStorageDB()

// Helper functions
export async function createProject(name: string): Promise<string> {
  const projectId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const project: MultiTrackProject = {
    id: projectId,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    masterVolume: 1,
    trackIds: [],
    // Initialize timeline state with defaults
    useTimeline: true, // Start with timeline view
    timelineState: {
      pixelsPerSecond: 100, // 100px = 1 second
      scrollX: 0,
      scrollY: 0,
      snapEnabled: true,
      snapInterval: 1, // 1 second snap intervals
      selectedClipIds: [],
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0,
    },
  }

  await multiTrackStorage.saveProject(project)
  return projectId
}

export async function addTrackToProject(
  projectId: string,
  name: string,
  audioBlob: Blob,
  options?: Partial<Track>
): Promise<string> {
  const project = await multiTrackStorage.getProject(projectId)
  if (!project) throw new Error("Project not found")

  const trackId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const existingTracks = await multiTrackStorage.getProjectTracks(projectId)

  const track: Track = {
    id: trackId,
    projectId,
    name,
    audioBlob,
    volume: options?.volume ?? 1,
    pan: options?.pan ?? 0,
    mute: options?.mute ?? false,
    solo: options?.solo ?? false,
    color: options?.color ?? getRandomTrackColor(),
    order: options?.order ?? existingTracks.length,
    timestamp: Date.now(),
  }

  await multiTrackStorage.saveTrack(track)

  // Update project's track list
  project.trackIds.push(trackId)
  project.updatedAt = Date.now()
  await multiTrackStorage.saveProject(project)

  return trackId
}

// Create an empty track (for timeline mode)
export async function createTrack(projectId: string, name?: string): Promise<string> {
  const project = await multiTrackStorage.getProject(projectId)
  if (!project) throw new Error("Project not found")

  const trackId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const existingTracks = await multiTrackStorage.getProjectTracks(projectId)

  const track: Track = {
    id: trackId,
    projectId,
    name: name || `Track ${existingTracks.length + 1}`,
    audioBlob: new Blob(), // Empty blob for timeline mode
    volume: 1,
    pan: 0,
    mute: false,
    solo: false,
    color: getRandomTrackColor(),
    order: existingTracks.length,
    timestamp: Date.now(),
    height: 100, // Default track height
    clips: [], // Empty clips array
  }

  await multiTrackStorage.saveTrack(track)

  // Update project's track list
  project.trackIds.push(trackId)
  project.updatedAt = Date.now()
  await multiTrackStorage.saveProject(project)

  return trackId
}

export async function updateTrack(trackId: string, updates: Partial<Track>): Promise<void> {
  const track = await multiTrackStorage.getTrack(trackId)
  if (!track) throw new Error("Track not found")

  const updatedTrack: Track = { ...track, ...updates }
  await multiTrackStorage.saveTrack(updatedTrack)

  // Update project timestamp
  const project = await multiTrackStorage.getProject(track.projectId)
  if (project) {
    project.updatedAt = Date.now()
    await multiTrackStorage.saveProject(project)
  }
}

export async function removeTrackFromProject(trackId: string): Promise<void> {
  const track = await multiTrackStorage.getTrack(trackId)
  if (!track) return

  const project = await multiTrackStorage.getProject(track.projectId)
  if (project) {
    project.trackIds = project.trackIds.filter((id) => id !== trackId)
    project.updatedAt = Date.now()
    await multiTrackStorage.saveProject(project)
  }

  await multiTrackStorage.deleteTrack(trackId)
}

export async function updateProjectMasterVolume(projectId: string, volume: number): Promise<void> {
  const project = await multiTrackStorage.getProject(projectId)
  if (!project) throw new Error("Project not found")

  project.masterVolume = volume
  project.updatedAt = Date.now()
  await multiTrackStorage.saveProject(project)
}

// Utility functions
function getRandomTrackColor(): string {
  const colors = [
    "#3b82f6", // blue
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#f59e0b", // amber
    "#10b981", // emerald
    "#06b6d4", // cyan
    "#f97316", // orange
    "#6366f1", // indigo
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Timeline helper functions

// Create an audio source from a blob
export async function createAudioSource(
  projectId: string,
  name: string,
  audioBlob: Blob,
  waveformData?: number[]
): Promise<string> {
  const sourceId = `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Get duration from audio blob
  const audioContext = new AudioContext()
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  const duration = audioBuffer.duration
  await audioContext.close()

  const source: AudioSource = {
    id: sourceId,
    projectId,
    name,
    audioBlob,
    duration,
    waveformData,
    createdAt: Date.now(),
  }

  await multiTrackStorage.saveAudioSource(source)
  return sourceId
}

// Create a clip from an audio source
export async function createClip(
  trackId: string,
  audioSourceId: string,
  startTime: number = 0,
  name?: string
): Promise<string> {
  const clipId = `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Get source to determine duration
  const source = await multiTrackStorage.getAudioSource(audioSourceId)
  if (!source) throw new Error("Audio source not found")

  const clip: AudioClip = {
    id: clipId,
    trackId,
    audioSourceId,
    startTime,
    duration: source.duration,
    trimStart: 0,
    trimEnd: 0,
    name: name || source.name,
    createdAt: Date.now(),
  }

  await multiTrackStorage.saveClip(clip)
  return clipId
}

// Update clip position or trim
export async function updateClip(clipId: string, updates: Partial<AudioClip>): Promise<void> {
  const clip = await multiTrackStorage.getClip(clipId)
  if (!clip) throw new Error("Clip not found")

  const updatedClip: AudioClip = { ...clip, ...updates }
  await multiTrackStorage.saveClip(updatedClip)
}

// Update timeline state
export async function updateTimelineState(
  projectId: string,
  updates: Partial<TimelineState>
): Promise<void> {
  const project = await multiTrackStorage.getProject(projectId)
  if (!project) throw new Error("Project not found")

  project.timelineState = {
    ...project.timelineState!,
    ...updates,
  }
  project.updatedAt = Date.now()
  await multiTrackStorage.saveProject(project)
}

// Generate waveform data from audio blob
export async function generateWaveformData(audioBlob: Blob, samples: number = 1000): Promise<number[]> {
  const audioContext = new AudioContext()
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  const waveform: number[] = []
  const blockSize = Math.floor(audioBuffer.length / samples)
  const channelData = audioBuffer.getChannelData(0) // Use mono or left channel

  for (let i = 0; i < samples; i++) {
    let sum = 0
    for (let j = 0; j < blockSize; j++) {
      const index = i * blockSize + j
      if (index < channelData.length) {
        sum += Math.abs(channelData[index])
      }
    }
    waveform.push(sum / blockSize)
  }

  await audioContext.close()
  return waveform
}
