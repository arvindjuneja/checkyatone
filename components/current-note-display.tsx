"use client"

import { type PitchData, getPitchAccuracy, detectVibrato } from "@/lib/pitch-detector"
import { Music, Activity } from "lucide-react"

interface CurrentNoteDisplayProps {
  currentPitch: PitchData | null
  pitchHistory: PitchData[]
}

// Progress Ring Component
function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  accuracy,
}: {
  progress: number
  size?: number
  strokeWidth?: number
  accuracy: "perfect" | "good" | "off" | null
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  const getGradientId = () => {
    if (accuracy === "perfect") return "gradient-perfect"
    if (accuracy === "good") return "gradient-good"
    return "gradient-off"
  }

  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id="gradient-perfect" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.70 0.12 175)" />
          <stop offset="100%" stopColor="oklch(0.75 0.14 185)" />
        </linearGradient>
        <linearGradient id="gradient-good" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.75 0.14 85)" />
          <stop offset="100%" stopColor="oklch(0.80 0.16 90)" />
        </linearGradient>
        <linearGradient id="gradient-off" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="oklch(0.60 0.14 20)" />
          <stop offset="100%" stopColor="oklch(0.65 0.16 25)" />
        </linearGradient>
      </defs>
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="oklch(0.25 0.008 15)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${getGradientId()})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
    </svg>
  )
}

export function CurrentNoteDisplay({ currentPitch, pitchHistory }: CurrentNoteDisplayProps) {
  const accuracy = currentPitch ? getPitchAccuracy(currentPitch.cents) : null
  const vibrato = detectVibrato(pitchHistory)

  // Calculate accuracy as percentage (0-100) based on cents deviation
  const getAccuracyPercent = () => {
    if (!currentPitch) return 0
    const cents = Math.abs(currentPitch.cents)
    // 0 cents = 100%, 50 cents = 0%
    return Math.max(0, Math.round(100 - (cents * 2)))
  }

  const getEncouragement = () => {
    if (!accuracy) return ""
    if (accuracy === "perfect") return "Swietnie!"
    if (accuracy === "good") return "Dobrze!"
    return "Poprawiaj!"
  }

  const getAccuracyColor = () => {
    if (!accuracy) return "text-muted-foreground"
    if (accuracy === "perfect") return "text-pitch-perfect"
    if (accuracy === "good") return "text-pitch-good"
    return "text-pitch-off"
  }

  const getAccuracyBg = () => {
    if (!accuracy) return "bg-secondary/50"
    if (accuracy === "perfect") return "bg-pitch-perfect/10"
    if (accuracy === "good") return "bg-pitch-good/10"
    return "bg-pitch-off/10"
  }

  const accuracyPercent = getAccuracyPercent()

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Accuracy Progress Ring */}
      <div className={`${getAccuracyBg()} rounded-3xl p-5 flex flex-col items-center justify-center`}>
        <div className="relative">
          <ProgressRing progress={accuracyPercent} accuracy={accuracy} />
          <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
            <span className={`text-3xl font-bold tabular-nums ${getAccuracyColor()}`}>
              {currentPitch ? `${accuracyPercent}%` : "--"}
            </span>
            {accuracy && (
              <span className={`text-xs font-medium ${getAccuracyColor()}`}>
                {getEncouragement()}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground mt-3">Dokladnosc</span>
      </div>

      {/* Current Note & Vibrato */}
      <div className="flex flex-col gap-3">
        {/* Current Note */}
        <div className={`${getAccuracyBg()} rounded-3xl p-4 flex-1 flex flex-col items-center justify-center`}>
          <Music className="w-4 h-4 text-muted-foreground mb-1" />
          <span className={`text-3xl font-bold tabular-nums ${getAccuracyColor()}`}>
            {currentPitch ? `${currentPitch.note}${currentPitch.octave}` : "--"}
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            {currentPitch ? `${currentPitch.frequency.toFixed(0)} Hz` : "Brak dzwieku"}
          </span>
        </div>

        {/* Vibrato */}
        <div className="bg-secondary/50 rounded-3xl p-4 flex-1 flex flex-col items-center justify-center">
          <Activity className="w-4 h-4 text-muted-foreground mb-1" />
          <span className="text-2xl font-bold tabular-nums text-primary">
            {vibrato && vibrato.rate > 2 ? vibrato.rate.toFixed(1) : "--"}
          </span>
          <span className="text-xs text-muted-foreground">Hz vibrato</span>
        </div>
      </div>
    </div>
  )
}
