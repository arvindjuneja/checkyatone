"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { BookOpen, Gamepad2, Music } from "lucide-react"

export default function TrainingPage() {
  const router = useRouter()

  useEffect(() => {
    document.title = "Vocal Coach - Trenuj"
    trackPageView("Vocal Coach - Trenuj", "/training")
  }, [])

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="bg-card rounded-xl p-4 border border-border">
        <h2 className="text-xl font-bold mb-2">Tryb treningowy</h2>
        <p className="text-sm text-muted-foreground">
          Wybierz sposób na ćwiczenie słuchu i precyzji wokalnej
        </p>
      </div>

      <div className="grid gap-3">
        {/* Exercises Option */}
        <button
          onClick={() => router.push("/training/exercises")}
          className="group bg-card hover:bg-accent transition-colors rounded-xl p-5 border border-border text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-pitch-perfect/10 flex items-center justify-center shrink-0 group-hover:bg-pitch-perfect/20 transition-colors">
              <BookOpen className="w-6 h-6 text-pitch-perfect" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Ćwiczenia</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ćwicz z przewodnikiem różne skale, arpeggia i interwały. Wybieraj spośród różnych poziomów trudności.
              </p>
            </div>
          </div>
        </button>

        {/* Hit the Note! Game Option */}
        <button
          onClick={() => router.push("/training/game")}
          className="group bg-card hover:bg-accent transition-colors rounded-xl p-5 border border-border text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 group-hover:bg-violet-500/20 transition-colors">
              <Gamepad2 className="w-6 h-6 text-violet-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Hit the Note!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gra w której musisz trafić losowo wybrane nuty. Im więcej trafisz, tym więcej punktów zdobędziesz!
              </p>
            </div>
          </div>
        </button>

        {/* Sing Along Option */}
        <button
          onClick={() => router.push("/training/singalong")}
          className="group bg-card hover:bg-accent transition-colors rounded-xl p-5 border border-border text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
              <Music className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Śpiewaj z piosenką</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Śpiewaj wraz z wybraną melodią MIDI. Zobacz jak dokładnie trafiasz w nuty piosenki.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
