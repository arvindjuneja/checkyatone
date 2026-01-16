"use client"

import { useEffect } from "react"
import { trackPageView } from "@/lib/analytics"
import { Settings, Info, HelpCircle, Volume2 } from "lucide-react"

export default function SettingsPage() {
  useEffect(() => {
    document.title = "Vocal Coach - Ustawienia"
    trackPageView("Vocal Coach - Ustawienia", "/settings")
  }, [])

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-pitch-perfect" />
          Ustawienia
        </h1>
        <p className="text-sm text-muted-foreground">
          Konfiguracja aplikacji i informacje
        </p>
      </div>

      {/* Audio Settings Info */}
      <div className="bg-card rounded-xl p-6 border border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pitch-perfect/10 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-pitch-perfect" />
          </div>
          <div>
            <h3 className="font-semibold">Ustawienia audio</h3>
            <p className="text-sm text-muted-foreground">
              Dostosuj czulosc mikrofonu i wzmocnienie
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Ustawienia audio (wzmocnienie i czulosc) sa dostepne bezposrednio na stronie nagrywania "Na zywo".
          Dzieki temu mozesz dostosowac je w czasie rzeczywistym podczas nagrywania.
        </p>
      </div>

      {/* Help */}
      <div className="bg-card rounded-xl p-6 border border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold">Pomoc</h3>
            <p className="text-sm text-muted-foreground">
              Jak korzystac z aplikacji
            </p>
          </div>
        </div>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p><strong>Nagrywaj</strong> - Nagrywaj swoj glos z detekcja wysokosci dzwieku w czasie rzeczywistym.</p>
          <p><strong>Trenuj</strong> - Cwicz z interaktywnymi cwiczeniami, grami i spiewaniem z podkladem.</p>
          <p><strong>Edytuj</strong> - Przetwarzaj nagrania z profesjonalnymi efektami lub twórz projekty wielosciezkowe.</p>
          <p><strong>Biblioteka</strong> - Przegladaj zapisane sesje, analizuj swoje postepy i sledz zakres wokalny.</p>
        </div>
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            <strong>Skroty klawiszowe:</strong> Nacisnij <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">?</kbd> aby zobaczyc wszystkie dostepne skroty.
          </p>
        </div>
      </div>

      {/* About */}
      <div className="bg-card rounded-xl p-6 border border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Info className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <h3 className="font-semibold">O aplikacji</h3>
            <p className="text-sm text-muted-foreground">
              Vocal Coach by Arvind
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed">
          Czesc, jestem Arvind i uwazam, ze znalezienie komfortu z wlasnym glosem - i czerpanie radosci z
          wydawania z siebie dzwiekow - sa warte tego, zeby codziennie poswiecic chwile na pracy nad
          glosem.
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
        <div className="pt-4 border-t border-border">
          <a
            href="https://instagram.com/arvindspiewa"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-pitch-perfect hover:underline"
          >
            @arvindspiewa na Instagramie
          </a>
        </div>
      </div>
    </div>
  )
}
