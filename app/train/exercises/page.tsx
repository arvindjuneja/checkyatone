"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView } from "@/lib/analytics"
import { TrainingMode } from "@/components/training-mode"
import { ArrowLeft } from "lucide-react"

export default function ExercisesPage() {
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
    document.title = "Vocal Coach - Cwiczenia"
    trackPageView("Vocal Coach - Cwiczenia", "/train/exercises")
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
      <TrainingMode
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
