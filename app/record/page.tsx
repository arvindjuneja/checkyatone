"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { Mic, Music, Radio } from "lucide-react"

export default function RecordPage() {
  const router = useRouter()

  useEffect(() => {
    document.title = "Vocal Coach - Nagrywaj"
    trackPageView("Vocal Coach - Nagrywaj", "/record")
  }, [])

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="bg-card rounded-xl p-4 border border-border">
        <h2 className="text-xl font-bold mb-2">Nagrywaj</h2>
        <p className="text-sm text-muted-foreground">
          Wybierz tryb nagrywania
        </p>
      </div>

      <div className="grid gap-3">
        {/* Live Recording Option */}
        <button
          onClick={() => router.push("/record/live")}
          className="group bg-card hover:bg-accent transition-colors rounded-xl p-5 border border-border text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-pitch-perfect/10 flex items-center justify-center shrink-0 group-hover:bg-pitch-perfect/20 transition-colors">
              <Radio className="w-6 h-6 text-pitch-perfect" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Na żywo</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Nagrywaj z detekcją wysokości dźwięku w czasie rzeczywistym. Zobacz wizualizację swojego głosu.
              </p>
            </div>
          </div>
        </button>

        {/* Karaoke Option */}
        <button
          onClick={() => router.push("/record/karaoke")}
          className="group bg-card hover:bg-accent transition-colors rounded-xl p-5 border border-border text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
              <Music className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Karaoke</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Śpiewaj z YouTube, nagrywaj swój wokal oddzielnie od podkładu muzycznego.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
