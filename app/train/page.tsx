"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { BookOpen, Gamepad2, Music } from "lucide-react"

export default function TrainPage() {
  const router = useRouter()

  useEffect(() => {
    document.title = "Vocal Coach - Trenuj"
    trackPageView("Vocal Coach - Trenuj", "/train")
  }, [])

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-24">
      {/* Header card */}
      <div className="rounded-3xl bg-card/80 backdrop-blur-sm border border-white/5 shadow-[0_8px_32px_-12px] shadow-black/30 p-5">
        <h2 className="text-xl font-bold mb-2">Tryb treningowy</h2>
        <p className="text-sm text-muted-foreground">
          Wybierz sposob na cwiczenie sluchu i precyzji wokalnej
        </p>
      </div>

      <div className="grid gap-3">
        {/* Exercises Option */}
        <button
          onClick={() => router.push("/train/exercises")}
          className="card-lift group rounded-3xl border border-white/5 bg-gradient-to-br from-pitch-perfect/10 to-card/80 hover:border-pitch-perfect/30 p-5 text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-pitch-perfect/15 flex items-center justify-center shrink-0 group-hover:bg-pitch-perfect/25 transition-colors shadow-lg shadow-pitch-perfect/10">
              <BookOpen className="w-6 h-6 text-pitch-perfect" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Cwiczenia</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cwicz z przewodnikiem rozne skale, arpeggia i interwaly. Wybieraj sposrod roznych poziomow trudnosci.
              </p>
            </div>
          </div>
        </button>

        {/* Hit the Note! Game Option */}
        <button
          onClick={() => router.push("/train/game")}
          className="card-lift group rounded-3xl border border-white/5 bg-gradient-to-br from-pitch-good/10 to-card/80 hover:border-pitch-good/30 p-5 text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-pitch-good/15 flex items-center justify-center shrink-0 group-hover:bg-pitch-good/25 transition-colors shadow-lg shadow-pitch-good/10">
              <Gamepad2 className="w-6 h-6 text-pitch-good" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Hit the Note!</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Gra w ktorej musisz trafic losowo wybrane nuty. Im wiecej trafisz, tym wiecej punktow zdobedziesz!
              </p>
            </div>
          </div>
        </button>

        {/* Sing Along Option */}
        <button
          onClick={() => router.push("/train/singalong")}
          className="card-lift group rounded-3xl border border-white/5 bg-gradient-to-br from-primary/10 to-card/80 hover:border-primary/30 p-5 text-left"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors shadow-lg shadow-primary/10">
              <Music className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base mb-1">Spiewaj z piosenka</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Spiewaj wraz z wybrana melodia MIDI. Zobacz jak dokladnie trafiasz w nuty piosenki.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
