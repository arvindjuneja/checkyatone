// Multi-track project storage using IndexedDB

const DB_NAME = "vocal-coach-multitrack"
const DB_VERSION = 1
const PROJECTS_STORE = "projects"
const TRACKS_STORE = "tracks"

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
}

export interface MultiTrackProject {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  masterVolume: number
  trackIds: string[] // Array of track IDs in order
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
