"use client"

import { type VocalRange } from "@/hooks/use-vocal-range"
import { TrendingUp, TrendingDown, Music2 } from "lucide-react"

interface VocalRangeDisplayProps {
  range: VocalRange | null
}

export function VocalRangeDisplay({ range }: VocalRangeDisplayProps) {
  if (!range) {
    return (
      <div className="bg-card rounded-xl p-6 border border-border text-center">
        <Music2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">
          Zacznij śpiewać aby wykryć swój zakres wokalny
        </p>
      </div>
    )
  }

  const { lowestNote, lowestOctave, highestNote, highestOctave, rangeInSemitones, voiceType } = range

  return (
    <div className="space-y-4">
      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-4">
        {/* Lowest Note */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-blue-500" />
            <span className="text-sm text-muted-foreground">Najniższa nuta</span>
          </div>
          <div className="text-3xl font-bold">
            {lowestNote}{lowestOctave}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {range.lowestFrequency.toFixed(1)} Hz
          </div>
        </div>

        {/* Highest Note */}
        <div className="bg-card rounded-xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <span className="text-sm text-muted-foreground">Najwyższa nuta</span>
          </div>
          <div className="text-3xl font-bold">
            {highestNote}{highestOctave}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {range.highestFrequency.toFixed(1)} Hz
          </div>
        </div>
      </div>

      {/* Range Info */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold mb-1">Zakres wokalny</h3>
            <p className="text-2xl font-bold text-pitch-perfect">
              {rangeInSemitones} półtonów
            </p>
          </div>
          {voiceType && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground mb-1">Sugerowany typ głosu</p>
              <p className="text-xl font-bold">{voiceType}</p>
            </div>
          )}
        </div>

        {/* Visual Range Bar */}
        <div className="space-y-2">
          <div className="h-8 bg-secondary rounded-lg relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-medium text-muted-foreground">
                {lowestNote}{lowestOctave} → {highestNote}{highestOctave}
              </span>
            </div>
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-30"
              style={{ width: `${Math.min(rangeInSemitones * 3, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Niżej</span>
            <span>Wyżej</span>
          </div>
        </div>
      </div>

      {/* Voice Type Info */}
      {voiceType && (
        <div className="bg-pitch-perfect/10 rounded-xl p-4 border border-pitch-perfect/20">
          <p className="text-sm text-pitch-perfect">
            <strong>💡 Wskazówka:</strong> Twój zakres {rangeInSemitones} półtonów sugeruje typ głosu <strong>{voiceType}</strong>.
            To tylko wskazówka bazująca na aktualnych nagraniach - Twój rzeczywisty zakres może być szerszy!
          </p>
        </div>
      )}

      {/* Range Tips */}
      <div className="bg-card rounded-xl p-4 border border-border">
        <h4 className="font-semibold mb-2 text-sm">Jak rozszerzyć zakres?</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-pitch-perfect">•</span>
            <span>Regularnie ćwicz skalę od najniższej do najwyższej nuty</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-pitch-perfect">•</span>
            <span>Rozgrzewaj głos przed śpiewaniem</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-pitch-perfect">•</span>
            <span>Stopniowo rozszerzaj zakres o pół tonu co tydzień</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
