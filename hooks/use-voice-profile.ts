"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { VoiceProfile } from "@/lib/pitch-detector-pro"

const STORAGE_KEY = "voice-profile-v1"
const MAX_RECENT_F0S = 1000 // Keep last 1000 pitches for comfort calculation
const MIN_SAMPLES_FOR_PROFILE = 50 // Need at least this many samples
const PROFILE_EXPIRY_DAYS = 30 // Reset profile if older than this

interface StoredProfile {
  minF0: number
  maxF0: number
  recentF0s: number[]
  sampleCount: number
  lastUpdated: number
}

function loadStoredProfile(): StoredProfile | null {
  if (typeof window === "undefined") return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null

    const profile: StoredProfile = JSON.parse(stored)

    // Check if profile is expired
    const daysSinceUpdate = (Date.now() - profile.lastUpdated) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate > PROFILE_EXPIRY_DAYS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }

    return profile
  } catch (e) {
    console.error("Failed to load voice profile:", e)
    return null
  }
}

function saveStoredProfile(profile: StoredProfile): void {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch (e) {
    console.error("Failed to save voice profile:", e)
  }
}

function calculateComfortableF0(recentF0s: number[]): number {
  if (recentF0s.length === 0) return 200 // Default

  // Use median for robustness against outliers
  const sorted = [...recentF0s].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export function useVoiceProfile() {
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null)
  const storedProfileRef = useRef<StoredProfile | null>(null)
  const updateBatchRef = useRef<number[]>([])
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load profile on mount
  useEffect(() => {
    const stored = loadStoredProfile()
    storedProfileRef.current = stored

    if (stored && stored.sampleCount >= MIN_SAMPLES_FOR_PROFILE) {
      setVoiceProfile({
        minF0: stored.minF0,
        maxF0: stored.maxF0,
        comfortableF0: calculateComfortableF0(stored.recentF0s),
        sampleCount: stored.sampleCount,
      })
    }
  }, [])

  // Batch updates to avoid excessive localStorage writes
  const flushBatch = useCallback(() => {
    if (updateBatchRef.current.length === 0) return

    const newF0s = updateBatchRef.current
    updateBatchRef.current = []

    const current = storedProfileRef.current || {
      minF0: Infinity,
      maxF0: -Infinity,
      recentF0s: [],
      sampleCount: 0,
      lastUpdated: Date.now(),
    }

    // Update min/max
    let minF0 = current.minF0
    let maxF0 = current.maxF0
    for (const f0 of newF0s) {
      if (f0 < minF0) minF0 = f0
      if (f0 > maxF0) maxF0 = f0
    }

    // Update recent F0s (keep limited history)
    const recentF0s = [...current.recentF0s, ...newF0s].slice(-MAX_RECENT_F0S)

    const updated: StoredProfile = {
      minF0,
      maxF0,
      recentF0s,
      sampleCount: current.sampleCount + newF0s.length,
      lastUpdated: Date.now(),
    }

    storedProfileRef.current = updated
    saveStoredProfile(updated)

    // Update voice profile state if we have enough samples
    if (updated.sampleCount >= MIN_SAMPLES_FOR_PROFILE) {
      setVoiceProfile({
        minF0: updated.minF0,
        maxF0: updated.maxF0,
        comfortableF0: calculateComfortableF0(updated.recentF0s),
        sampleCount: updated.sampleCount,
      })
    }
  }, [])

  // Add a detected frequency to the profile
  const addPitch = useCallback(
    (frequency: number) => {
      // Validate frequency is in reasonable vocal range
      if (frequency < 50 || frequency > 2500) return

      updateBatchRef.current.push(frequency)

      // Batch writes - flush every 500ms
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
      }
      batchTimeoutRef.current = setTimeout(flushBatch, 500)
    },
    [flushBatch]
  )

  // Reset the profile
  const resetProfile = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY)
    }
    storedProfileRef.current = null
    setVoiceProfile(null)
    updateBatchRef.current = []
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current)
      }
      // Flush any pending updates
      if (updateBatchRef.current.length > 0) {
        flushBatch()
      }
    }
  }, [flushBatch])

  return {
    voiceProfile,
    addPitch,
    resetProfile,
    hasEnoughData: voiceProfile !== null && voiceProfile.sampleCount >= MIN_SAMPLES_FOR_PROFILE,
  }
}
