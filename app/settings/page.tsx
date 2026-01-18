"use client"

import { useEffect } from "react"
import { trackPageView } from "@/lib/analytics"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { Settings, Info, HelpCircle, Volume2, Sparkles, Zap } from "lucide-react"

export default function SettingsPage() {
  const { detectionMode, setDetectionMode, gain, sensitivity, updateGain, updateSensitivity } = useAudioRecorderContext()

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

      {/* Audio Settings */}
      <div className="bg-card rounded-xl p-6 border border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-pitch-perfect/10 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-pitch-perfect" />
          </div>
          <div>
            <h3 className="font-semibold">Ustawienia audio</h3>
            <p className="text-sm text-muted-foreground">
              Tryb detekcji i konfiguracja mikrofonu
            </p>
          </div>
        </div>

        {/* Detection Mode Toggle */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Tryb detekcji wysokosci dzwieku</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDetectionMode("pro")}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                detectionMode === "pro"
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className={`w-5 h-5 ${detectionMode === "pro" ? "text-emerald-500" : "text-muted-foreground"}`} />
                <span className="font-semibold">Pro</span>
                {detectionMode === "pro" && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Aktywny</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Analizuje harmoniczne sygnalu, by precyzyjnie rozpoznac oktawe (C3 vs C4). Zalecany.
              </p>
            </button>
            <button
              onClick={() => setDetectionMode("basic")}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                detectionMode === "basic"
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`w-5 h-5 ${detectionMode === "basic" ? "text-blue-500" : "text-muted-foreground"}`} />
                <span className="font-semibold">Basic</span>
                {detectionMode === "basic" && (
                  <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">Aktywny</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Szybka detekcja YIN. Moze czasem mylic oktawy przy niskich tonach.
              </p>
            </button>
          </div>
        </div>

        {/* Microphone Settings */}
        <div className="pt-4 border-t border-border space-y-4">
          <label className="text-sm font-medium">Ustawienia mikrofonu</label>

          {/* Gain Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Wzmocnienie</span>
              <span className="text-sm font-medium">{gain.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={gain}
              onChange={(e) => updateGain(parseFloat(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-primary
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-primary
                [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              Zwieksz, jesli aplikacja slabo odbiera dzwiek. Zmniejsz, jesli jest zbyt czula.
            </p>
          </div>

          {/* Sensitivity Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Czulosc</span>
              <span className="text-sm font-medium">
                {sensitivity <= 0.0002 ? "Bardzo wysoka" :
                 sensitivity <= 0.0007 ? "Wysoka" :
                 sensitivity <= 0.0015 ? "Normalna" :
                 sensitivity <= 0.003 ? "Niska" : "Bardzo niska"}
              </span>
            </div>
            <input
              type="range"
              min="0.0001"
              max="0.005"
              step="0.0001"
              value={sensitivity}
              onChange={(e) => updateSensitivity(parseFloat(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-primary
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-primary
                [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">
              Okresla minimalny poziom dzwieku do wykrycia. Nizsza wartosc = wieksza czulosc.
            </p>
          </div>

          {/* Reset Button */}
          <button
            onClick={() => {
              updateGain(2.0)
              updateSensitivity(0.002)
            }}
            className="w-full py-2 px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
          >
            Przywroc domyslne
          </button>
        </div>
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

        {/* Pro vs Basic detailed explanation */}
        <div className="pt-4 border-t border-border space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            Pro vs Basic - jak dziala detekcja?
          </h4>

          <div className="space-y-4 text-sm">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
              <p className="font-medium text-foreground">Problem z oktawami</p>
              <p className="text-muted-foreground">
                Gdy spiewasz C4 (261 Hz), Twoj glos produkuje takze harmoniczne: C5 (522 Hz), G5 (784 Hz) itd.
                Prosty detektor moze pomylic te harmoniczne z podstawowa czestotliwoscia i pokazac zla oktawe.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                Basic (YIN)
              </p>
              <p className="text-muted-foreground">
                Uzywa algorytmu YIN do znalezienia okresowosci sygnalu. Szybki i sprawdza sie przy wyzszych tonach,
                ale przy niskich dzwiekach (np. meski glos) moze czasem wybrac subharmoniczna (oktawe nizej).
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Pro (Multi-Hypothesis)
              </p>
              <p className="text-muted-foreground">
                Znajduje kilka kandydatow na czestotliwosc, a nastepnie ocenia kazdego wedlug 4 kryteriow:
              </p>
              <ul className="text-muted-foreground space-y-1 ml-4">
                <li><strong>40% Harmoniczne</strong> - czy ta czestotliwosc najlepiej wyjasnia widmo FFT?</li>
                <li><strong>30% Stabilnosc</strong> - czy to zgodne z poprzednimi ramkami (bez skakania)?</li>
                <li><strong>20% Zakres glosu</strong> - czy to w Twoim typowym zakresie wokalnym?</li>
                <li><strong>10% Pewnosc YIN</strong> - jak silny jest sygnal okresowy?</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Wygrywa kandydat z najwyzszym wynikiem - nie najglosniejszy, ale ten ktory najlepiej pasuje do calego obrazu.
              </p>
            </div>

            <div className="bg-emerald-500/10 rounded-lg p-3 text-emerald-200 text-xs">
              <strong>Wskazowka:</strong> Pro uczy sie Twojego zakresu wokalnego w czasie. Im wiecej spiewasz, tym lepiej rozpoznaje Twoj glos.
            </div>
          </div>
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
