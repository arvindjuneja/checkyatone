import { useState, useEffect, useCallback } from "react"
import { type PitchData } from "@/lib/pitch-detector"

export interface SessionMetadata {
  id: string
  name: string
  date: Date
  mode: "live" | "training" | "analysis"
  duration: number
  noteCount: number
  averageAccuracy?: number
}

export interface Session extends SessionMetadata {
  pitchHistory: PitchData[]
}

const SESSIONS_STORAGE_KEY = "vocal-coach-sessions"
const MAX_SESSIONS = 50

export function useSessionLibrary() {
  const [sessions, setSessions] = useState<SessionMetadata[]>([])
  const [loading, setLoading] = useState(true)

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Convert date strings back to Date objects
        const sessionsWithDates = parsed.map((s: any) => ({
          ...s,
          date: new Date(s.date),
        }))
        setSessions(sessionsWithDates)
      }
    } catch (error) {
      console.error("Failed to load sessions:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Save session
  const saveSession = useCallback(
    (
      pitchHistory: PitchData[],
      mode: "live" | "training" | "analysis",
      duration: number,
      customName?: string
    ) => {
      if (pitchHistory.length === 0) return null

      // Calculate average accuracy
      const perfectCount = pitchHistory.filter((p) => Math.abs(p.cents) <= 10).length
      const goodCount = pitchHistory.filter((p) => Math.abs(p.cents) > 10 && Math.abs(p.cents) <= 25).length
      const averageAccuracy = ((perfectCount + goodCount * 0.7) / pitchHistory.length) * 100

      const session: Session = {
        id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: customName || `Sesja ${new Date().toLocaleDateString("pl-PL")} ${new Date().toLocaleTimeString("pl-PL")}`,
        date: new Date(),
        mode,
        duration,
        noteCount: pitchHistory.length,
        averageAccuracy: Math.round(averageAccuracy),
        pitchHistory,
      }

      try {
        // Get existing sessions
        const stored = localStorage.getItem(SESSIONS_STORAGE_KEY)
        const existingSessions: Session[] = stored ? JSON.parse(stored) : []

        // Add new session at the beginning
        const updatedSessions = [session, ...existingSessions]

        // Keep only the last MAX_SESSIONS
        const trimmedSessions = updatedSessions.slice(0, MAX_SESSIONS)

        // Save to localStorage
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(trimmedSessions))

        // Update state (without pitch history for list view)
        const metadata = trimmedSessions.map(({ pitchHistory: _, ...meta }) => meta)
        setSessions(metadata)

        return session.id
      } catch (error) {
        console.error("Failed to save session:", error)
        return null
      }
    },
    []
  )

  // Load full session with pitch history
  const loadSession = useCallback((sessionId: string): Session | null => {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY)
      if (!stored) return null

      const sessions: Session[] = JSON.parse(stored)
      const session = sessions.find((s) => s.id === sessionId)

      if (session) {
        return {
          ...session,
          date: new Date(session.date),
        }
      }
      return null
    } catch (error) {
      console.error("Failed to load session:", error)
      return null
    }
  }, [])

  // Delete session
  const deleteSession = useCallback((sessionId: string) => {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY)
      if (!stored) return

      const sessions: Session[] = JSON.parse(stored)
      const filtered = sessions.filter((s) => s.id !== sessionId)

      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(filtered))

      // Update state
      const metadata = filtered.map(({ pitchHistory: _, ...meta }) => meta)
      setSessions(metadata)
    } catch (error) {
      console.error("Failed to delete session:", error)
    }
  }, [])

  // Rename session
  const renameSession = useCallback((sessionId: string, newName: string) => {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY)
      if (!stored) return

      const sessions: Session[] = JSON.parse(stored)
      const sessionIndex = sessions.findIndex((s) => s.id === sessionId)

      if (sessionIndex !== -1) {
        sessions[sessionIndex].name = newName
        localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions))

        // Update state
        const metadata = sessions.map(({ pitchHistory: _, ...meta }) => meta)
        setSessions(metadata)
      }
    } catch (error) {
      console.error("Failed to rename session:", error)
    }
  }, [])

  return {
    sessions,
    loading,
    saveSession,
    loadSession,
    deleteSession,
    renameSession,
  }
}
