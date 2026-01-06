"use client"

import { Settings } from "lucide-react"
import { useState } from "react"

interface AudioSettingsProps {
  gain: number
  sensitivity: number
  onGainChange: (value: number) => void
  onSensitivityChange: (value: number) => void
  disabled?: boolean
}

export function AudioSettings({
  gain,
  sensitivity,
  onGainChange,
  onSensitivityChange,
  disabled = false,
}: AudioSettingsProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-muted-foreground" />
          <span className="font-semibold text-sm">Ustawienia audio</span>
        </div>
        <span className="text-muted-foreground text-sm">{isOpen ? "▼" : "▶"}</span>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-6">
          {/* Gain Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Wzmocnienie mikrofonu</label>
              <span className="text-sm text-muted-foreground">{gain.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={gain}
              onChange={(e) => onGainChange(parseFloat(e.target.value))}
              disabled={disabled}
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
                [&::-moz-range-thumb]:cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Zwiększ, jeśli aplikacja słabo odbiera dźwięk. Zmniejsz, jeśli jest zbyt czuła.
            </p>
          </div>

          {/* Sensitivity Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Czułość</label>
              <span className="text-sm text-muted-foreground">
                {sensitivity === 0.0001 ? "Bardzo wysoka" : 
                 sensitivity === 0.0005 ? "Wysoka" :
                 sensitivity === 0.001 ? "Normalna" :
                 sensitivity === 0.002 ? "Niska" : "Bardzo niska"}
              </span>
            </div>
            <input
              type="range"
              min="0.0001"
              max="0.005"
              step="0.0001"
              value={sensitivity}
              onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
              disabled={disabled}
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
                [&::-moz-range-thumb]:cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Określa minimalny poziom dźwięku do wykrycia. Niższa wartość = większa czułość.
            </p>
          </div>

          {/* Reset Button */}
          <button
            onClick={() => {
              onGainChange(2.0)
              onSensitivityChange(0.001)
            }}
            disabled={disabled}
            className="w-full py-2 px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Przywróć domyślne
          </button>
        </div>
      )}
    </div>
  )
}

