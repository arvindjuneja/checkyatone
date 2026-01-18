"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView } from "@/lib/analytics"
import { HitTheNoteGame } from "@/components/hit-the-note-game"
import { ArrowLeft } from "lucide-react"

export default function GamePage() {
  const router = useRouter()
  const {
    currentPitch,
    isRecording,
    startRecording,
    stopRecording,
    detectionMode,
    setDetectionMode,
  } = useAudioRecorderContext()

  useEffect(() => {
    document.title = "Vocal Coach - Hit the Note!"
    trackPageView("Vocal Coach - Hit the Note!", "/train/game")
  }, [])

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <button
        onClick={() => router.push("/train")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Powrot do menu
      </button>
      <HitTheNoteGame
        currentPitch={currentPitch}
        isRecordingActive={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        detectionMode={detectionMode}
        onDetectionModeChange={setDetectionMode}
      />
    </div>
  )
}
