"use client"

import { useState } from "react"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Save, X } from "lucide-react"
import { type PitchData } from "@/lib/pitch-detector"

interface SaveSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pitchHistory: PitchData[]
  duration: number
  mode: "live" | "training" | "analysis"
}

export function SaveSessionDialog({
  open,
  onOpenChange,
  pitchHistory,
  duration,
  mode,
}: SaveSessionDialogProps) {
  const { saveSession } = useSessionLibrary()
  const { audioBlob, saveAudioToSession } = useAudioRecorderContext()
  const [sessionName, setSessionName] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Check if audio is available
      const hasAudio = audioBlob !== null

      // Save the session and get the session ID
      const sessionId = saveSession(pitchHistory, mode, duration, sessionName || undefined, hasAudio)

      // If audio was recorded and session was saved, save the audio too
      if (sessionId && audioBlob) {
        await saveAudioToSession(sessionId)
      }

      // Close dialog and reset
      onOpenChange(false)
      setSessionName("")
    } catch (error) {
      console.error("Failed to save session:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = () => {
    onOpenChange(false)
    setSessionName("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zapisz sesję</DialogTitle>
          <DialogDescription>
            Nadaj nazwę swojej sesji aby łatwiej ją znaleźć później
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Session stats */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Czas nagrania:</span>
              <span className="font-mono">
                {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Liczba nut:</span>
              <span className="font-mono">{pitchHistory.length}</span>
            </div>
            {audioBlob && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Audio:</span>
                <span className="text-pitch-perfect font-semibold">✓ Tak</span>
              </div>
            )}
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <label htmlFor="session-name" className="text-sm font-medium">
              Nazwa sesji (opcjonalna)
            </label>
            <input
              id="session-name"
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder={`Sesja ${new Date().toLocaleDateString("pl-PL")} ${new Date().toLocaleTimeString("pl-PL")}`}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pitch-perfect"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave()
                if (e.key === "Escape") handleSkip()
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Zapisywanie..." : "Zapisz"}
            </Button>
            <Button
              onClick={handleSkip}
              variant="ghost"
              disabled={saving}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Pomiń
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
