"use client"

import { type PitchData, getPitchAccuracy, detectVibrato } from "@/lib/pitch-detector"
import { Music, TrendingUp, Activity } from "lucide-react"

interface CurrentNoteDisplayProps {
  currentPitch: PitchData | null
  pitchHistory: PitchData[]
}

export function CurrentNoteDisplay({ currentPitch, pitchHistory }: CurrentNoteDisplayProps) {
  const accuracy = currentPitch ? getPitchAccuracy(currentPitch.cents) : null
  const vibrato = detectVibrato(pitchHistory)

  const getAccuracyColor = () => {
    if (!accuracy) return "text-muted-foreground"
    if (accuracy === "perfect") return "text-pitch-perfect"
    if (accuracy === "good") return "text-pitch-good"
    return "text-pitch-off"
  }

  const getAccuracyBg = () => {
    if (!accuracy) return "bg-secondary"
    if (accuracy === "perfect") return "bg-pitch-perfect/20"
    if (accuracy === "good") return "bg-pitch-good/20"
    return "bg-pitch-off/20"
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Current Note */}
      <div className={`${getAccuracyBg()} rounded-xl p-4 flex flex-col items-center justify-center min-h-[120px]`}>
        <Music className="w-5 h-5 text-muted-foreground mb-2" />
        <span className={`text-4xl font-bold font-mono ${getAccuracyColor()}`}>
          {currentPitch ? `${currentPitch.note}${currentPitch.octave}` : "--"}
        </span>
        <span className="text-xs text-muted-foreground mt-1">
          {currentPitch ? `${currentPitch.frequency.toFixed(1)} Hz` : "Brak dźwięku"}
        </span>
      </div>

      {/* Pitch Accuracy */}
      <div className={`${getAccuracyBg()} rounded-xl p-4 flex flex-col items-center justify-center`}>
        <TrendingUp className="w-5 h-5 text-muted-foreground mb-2" />
        <span className={`text-3xl font-bold font-mono ${getAccuracyColor()}`}>
          {currentPitch ? `${currentPitch.cents > 0 ? "+" : ""}${currentPitch.cents}` : "--"}
        </span>
        <span className="text-xs text-muted-foreground mt-1">centów</span>
        {accuracy && (
          <span className={`text-xs mt-1 ${getAccuracyColor()}`}>
            {accuracy === "perfect" ? "✓ Idealnie!" : accuracy === "good" ? "~ Blisko" : "✗ Fałsz"}
          </span>
        )}
      </div>

      {/* Vibrato */}
      <div className="bg-secondary rounded-xl p-4 flex flex-col items-center justify-center">
        <Activity className="w-5 h-5 text-muted-foreground mb-2" />
        <span className="text-3xl font-bold font-mono text-primary">
          {vibrato && vibrato.rate > 2 ? vibrato.rate.toFixed(1) : "--"}
        </span>
        <span className="text-xs text-muted-foreground mt-1">Hz vibrato</span>
        {vibrato && vibrato.rate > 2 && (
          <span className="text-xs text-primary mt-1">±{vibrato.extent.toFixed(0)} centów</span>
        )}
      </div>
    </div>
  )
}
