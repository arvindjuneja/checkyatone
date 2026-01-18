"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { Metronome } from "@/components/metronome"
import { ArrowLeft } from "lucide-react"

export default function MetronomePage() {
  const router = useRouter()

  useEffect(() => {
    document.title = "Vocal Coach - Metronom"
    trackPageView("Vocal Coach - Metronom", "/guitar/metronome")
  }, [])

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <button
        onClick={() => router.push("/guitar")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Powrot do menu
      </button>

      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Metronom</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cwicz z precyzyjnym tempem
          </p>
        </div>

        <Metronome />
      </div>
    </div>
  )
}
