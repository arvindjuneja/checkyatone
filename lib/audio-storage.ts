// Audio storage using IndexedDB (for large audio files)

const DB_NAME = "vocal-coach-audio"
const DB_VERSION = 1
const STORE_NAME = "recordings"

interface AudioRecord {
  sessionId: string
  audioBlob: Blob
  timestamp: number
}

class AudioStorageDB {
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "sessionId" })
        }
      }
    })
  }

  async saveAudio(sessionId: string, audioBlob: Blob): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)

      const record: AudioRecord = {
        sessionId,
        audioBlob,
        timestamp: Date.now(),
      }

      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getAudio(sessionId: string): Promise<Blob | null> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(sessionId)

      request.onsuccess = () => {
        const record = request.result as AudioRecord | undefined
        resolve(record?.audioBlob || null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteAudio(sessionId: string): Promise<void> {
    if (!this.db) await this.init()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(sessionId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async hasAudio(sessionId: string): Promise<boolean> {
    const audio = await this.getAudio(sessionId)
    return audio !== null
  }
}

// Singleton instance
export const audioStorage = new AudioStorageDB()

// Helper functions
export async function saveSessionAudio(sessionId: string, audioBlob: Blob): Promise<void> {
  try {
    await audioStorage.saveAudio(sessionId, audioBlob)
  } catch (error) {
    console.error("Failed to save audio:", error)
    throw error
  }
}

export async function getSessionAudio(sessionId: string): Promise<Blob | null> {
  try {
    return await audioStorage.getAudio(sessionId)
  } catch (error) {
    console.error("Failed to get audio:", error)
    return null
  }
}

export async function deleteSessionAudio(sessionId: string): Promise<void> {
  try {
    await audioStorage.deleteAudio(sessionId)
  } catch (error) {
    console.error("Failed to delete audio:", error)
  }
}

export async function hasSessionAudio(sessionId: string): Promise<boolean> {
  try {
    return await audioStorage.hasAudio(sessionId)
  } catch (error) {
    console.error("Failed to check audio:", error)
    return false
  }
}
