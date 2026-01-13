"use client"

import { useEffect } from "react"
import { trackPageView } from "@/lib/analytics"

export default function AboutPage() {
  useEffect(() => {
    document.title = "Vocal Coach - Po co?"
    trackPageView("Vocal Coach - Po co?", "/about")
  }, [])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-card rounded-xl p-6 border border-border space-y-6">
        <h2 className="text-2xl font-bold">Po co?</h2>
        <p className="text-base leading-relaxed">
          Cześć, jestem Arvind i uważam, że znalezienie komfortu z własnym głosem - i czerpanie radości z
          wydawania z siebie dźwięków - są warte tego, żeby codziennie poswięcić chwilę na pracy nad
          głosem. Wkrótce dodam tu wyszukiwarkę nauczycieli śpiewu, bo warto. Poniżej krótka relacja z
          jedynej lekcji jaką w życiu wziąłem i którą doskonale wspominam.
        </p>
        <div className="aspect-video w-full">
          <iframe
            className="w-full h-full rounded-lg"
            src="https://www.youtube.com/embed/qu70CHn2mdU"
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}
