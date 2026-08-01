"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { ExerciseTrainer } from "@/components/exercise-trainer"
import { ArrowLeft } from "lucide-react"

export default function ExercisesPage() {
  const router = useRouter()

  useEffect(() => {
    document.title = "Vocal Coach - Cwiczenia"
    trackPageView("Vocal Coach - Cwiczenia", "/train/exercises")
  }, [])

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-24">
      <button
        onClick={() => router.push("/train")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Powrot do menu
      </button>
      <ExerciseTrainer />
    </div>
  )
}
