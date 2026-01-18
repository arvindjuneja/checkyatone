"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { GuitarTuner } from "@/components/guitar-tuner"
import { ArrowLeft } from "lucide-react"

export default function GuitarTunerPage() {
  const router = useRouter()

  useEffect(() => {
    document.title = "Vocal Coach - Guitar Tuner"
    trackPageView("Vocal Coach - Guitar Tuner", "/guitar/tuner")
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
      <GuitarTuner />
    </div>
  )
}
