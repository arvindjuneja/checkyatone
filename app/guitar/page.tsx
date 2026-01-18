"use client"

import { useEffect } from "react"
import Link from "next/link"
import { trackPageView } from "@/lib/analytics"
import { Guitar, Music, Gamepad2, Timer } from "lucide-react"

export default function GuitarPage() {
  useEffect(() => {
    document.title = "Vocal Coach - Guitar Tools"
    trackPageView("Vocal Coach - Guitar Tools", "/guitar")
  }, [])

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <Guitar className="w-12 h-12 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Narzedzia gitarowe</h1>
        <p className="text-sm text-muted-foreground">
          Stroik, metronom i gra w akordy
        </p>
      </div>

      {/* Options */}
      <div className="grid gap-4">
        <Link
          href="/guitar/tuner"
          className="bg-card hover:bg-card-hover border border-border rounded-2xl p-6 transition-all hover:shadow-lg hover:border-primary/50 group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Music className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-1">Stroik gitarowy</h2>
              <p className="text-sm text-muted-foreground">
                Dostroj gitare za pomoca mikrofonu. Wybierz stroj i kliknij strune aby uslyszec dzwiek referencyjny.
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/guitar/metronome"
          className="bg-card hover:bg-card-hover border border-border rounded-2xl p-6 transition-all hover:shadow-lg hover:border-primary/50 group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-pitch-good/10 flex items-center justify-center group-hover:bg-pitch-good/20 transition-colors">
              <Timer className="w-6 h-6 text-pitch-good" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-1">Metronom</h2>
              <p className="text-sm text-muted-foreground">
                Precyzyjny metronom z regulacja BPM, tap tempo i roznymi metrami (4/4, 3/4, 6/8).
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/guitar/game"
          className="bg-card hover:bg-card-hover border border-border rounded-2xl p-6 transition-all hover:shadow-lg hover:border-primary/50 group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-pitch-perfect/10 flex items-center justify-center group-hover:bg-pitch-perfect/20 transition-colors">
              <Gamepad2 className="w-6 h-6 text-pitch-perfect" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-1">Hit the Chord!</h2>
              <p className="text-sm text-muted-foreground">
                Gra w rozpoznawanie akordow. Zagraj pokazany akord na gitarze i zdobadz punkty!
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  )
}
