"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView } from "@/lib/analytics"
import { HitTheChordGame } from "@/components/hit-the-chord-game"
import { ArrowLeft } from "lucide-react"

export default function HitTheChordPage() {
  const router = useRouter()
  const {
    currentPitch,
    isRecording,
    startRecording,
    stopRecording,
  } = useAudioRecorderContext()

  useEffect(() => {
    document.title = "Vocal Coach - Hit the Chord!"
    trackPageView("Vocal Coach - Hit the Chord!", "/guitar/game")
  }, [])

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <button
        onClick={() => router.push("/guitar")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Powrot do menu
      </button>
      <HitTheChordGame
        currentPitch={currentPitch}
        isRecordingActive={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
      />
    </div>
  )
}
