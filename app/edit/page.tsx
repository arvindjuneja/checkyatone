"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { Sparkles, Layers } from "lucide-react"

export default function EditPage() {
  const router = useRouter()

  useEffect(() => {
    document.title = "Vocal Coach - Edytuj"
    trackPageView("Vocal Coach - Edytuj", "/edit")
  }, [])

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="bg-card rounded-xl p-4 border border-border">
        <h2 className="text-xl font-bold mb-2">Edytuj</h2>
        <p className="text-sm text-muted-foreground">
          Przetwarzaj i edytuj swoje nagrania
        </p>
      </div>

      <div className="grid gap-3">
        {/* Studio Option */}
        <button
          onClick={() => router.push("/edit/studio")}
          className="group bg-card hover:bg-accent transition-colors rounded-xl p-5 border border-border text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-pitch-perfect/10 flex items-center justify-center shrink-0 group-hover:bg-pitch-perfect/20 transition-colors">
              <Sparkles className="w-6 h-6 text-pitch-perfect" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Studio</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Przetwarzaj nagrania z profesjonalnymi efektami: kompresja, EQ, reverb. Uzyj gotowych presetow lub dostosuj ustawienia.
              </p>
            </div>
          </div>
        </button>

        {/* Multi-track Option */}
        <button
          onClick={() => router.push("/edit/projects")}
          className="group bg-card hover:bg-accent transition-colors rounded-xl p-5 border border-border text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
              <Layers className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Multi-track</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Profesjonalny edytor wielosciežkowy w stylu DAW. Twórz projekty z wieloma sciezkami audio.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
