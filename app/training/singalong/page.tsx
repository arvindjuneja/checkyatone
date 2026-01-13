"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView } from "@/lib/analytics"
import { SingAlong } from "@/components/sing-along"
import { ArrowLeft } from "lucide-react"

export default function SingAlongPage() {
  const router = useRouter()
  const {
    currentPitch,
    isRecording,
    startRecording,
    stopRecording,
  } = useAudioRecorderContext()

  useEffect(() => {
    document.title = "Vocal Coach - Śpiewaj z piosenką"
    trackPageView("Vocal Coach - Śpiewaj z piosenką", "/training/singalong")
  }, [])

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <button
        onClick={() => router.push("/training")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to menu
      </button>
      <SingAlong
        currentPitch={currentPitch}
        isRecordingActive={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
      />
    </div>
  )
}
