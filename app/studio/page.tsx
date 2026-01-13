"use client"

import { useState, useEffect } from "react"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { getSessionAudio } from "@/lib/audio-storage"
import {
  processAudio,
  getWaveformData,
  PRESETS,
  DEFAULT_SETTINGS,
  type AudioProcessingSettings
} from "@/lib/audio-processor"
import { WaveformDisplay } from "@/components/waveform-display"
import { Button } from "@/components/ui/button"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Download, Play, Pause, RotateCcw, Sparkles } from "lucide-react"

export default function StudioPage() {
  const { sessions } = useSessionLibrary()
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [originalAudio, setOriginalAudio] = useState<Blob | null>(null)
  const [processedAudio, setProcessedAudio] = useState<Blob | null>(null)
  const [originalWaveform, setOriginalWaveform] = useState<Float32Array | null>(null)
  const [processedWaveform, setProcessedWaveform] = useState<Float32Array | null>(null)

  const [settings, setSettings] = useState<AudioProcessingSettings>(DEFAULT_SETTINGS)
  const [selectedPreset, setSelectedPreset] = useState<string>("custom")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlayingOriginal, setIsPlayingOriginal] = useState(false)
  const [isPlayingProcessed, setIsPlayingProcessed] = useState(false)

  const [originalAudioEl, setOriginalAudioEl] = useState<HTMLAudioElement | null>(null)
  const [processedAudioEl, setProcessedAudioEl] = useState<HTMLAudioElement | null>(null)

  useEffect(() => {
    document.title = "Vocal Coach - Studio"
    trackPageView("Vocal Coach - Studio", "/studio")
  }, [])

  // Load audio when session is selected
  useEffect(() => {
    if (!selectedSessionId) return

    const loadAudio = async () => {
      const audioBlob = await getSessionAudio(selectedSessionId)
      if (audioBlob) {
        setOriginalAudio(audioBlob)
        const waveform = await getWaveformData(audioBlob)
        setOriginalWaveform(waveform)

        // Create audio element for playback
        const audio = new Audio(URL.createObjectURL(audioBlob))
        setOriginalAudioEl(audio)
      }
    }

    loadAudio()
  }, [selectedSessionId])

  // Get sessions with audio
  const sessionsWithAudio = sessions.filter(s => s.hasAudio)

  const handlePresetChange = (presetKey: string) => {
    setSelectedPreset(presetKey)

    if (presetKey === "custom") {
      setSettings(DEFAULT_SETTINGS)
    } else {
      const preset = PRESETS[presetKey]
      if (preset) {
        setSettings(preset.settings)
        trackEvent("preset_applied", "Studio", preset.name)
      }
    }
  }

  const handleProcess = async () => {
    if (!originalAudio) return

    setIsProcessing(true)
    try {
      const processed = await processAudio(originalAudio, settings)
      setProcessedAudio(processed)

      const waveform = await getWaveformData(processed)
      setProcessedWaveform(waveform)

      // Create audio element for playback
      const audio = new Audio(URL.createObjectURL(processed))
      setProcessedAudioEl(audio)

      trackEvent("audio_processed", "Studio", selectedPreset)
    } catch (error) {
      console.error("Failed to process audio:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDownload = () => {
    if (!processedAudio) return

    const url = URL.createObjectURL(processedAudio)
    const a = document.createElement("a")
    a.href = url
    a.download = `processed-${new Date().getTime()}.wav`
    a.click()
    URL.revokeObjectURL(url)

    trackEvent("audio_downloaded", "Studio")
  }

  const togglePlayOriginal = () => {
    if (!originalAudioEl) return

    if (isPlayingOriginal) {
      originalAudioEl.pause()
      setIsPlayingOriginal(false)
    } else {
      originalAudioEl.play()
      setIsPlayingOriginal(true)

      originalAudioEl.onended = () => setIsPlayingOriginal(false)
    }
  }

  const togglePlayProcessed = () => {
    if (!processedAudioEl) return

    if (isPlayingProcessed) {
      processedAudioEl.pause()
      setIsPlayingProcessed(false)
    } else {
      processedAudioEl.play()
      setIsPlayingProcessed(true)

      processedAudioEl.onended = () => setIsPlayingProcessed(false)
    }
  }

  const updateSetting = <K extends keyof AudioProcessingSettings>(
    key: K,
    value: AudioProcessingSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSelectedPreset("custom") // Switch to custom when manually adjusting
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-pitch-perfect" />
          Recording Studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Enhance your recordings with professional audio processing
        </p>
      </div>

      {/* Select Recording */}
      {sessionsWithAudio.length === 0 ? (
        <div className="bg-card rounded-xl p-8 border border-border text-center">
          <p className="text-muted-foreground">
            No recordings with audio found. Record a session first to use the studio.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-card rounded-xl p-4 border border-border">
            <label className="text-sm font-semibold mb-2 block">Select Recording</label>
            <select
              value={selectedSessionId || ""}
              onChange={(e) => setSelectedSessionId(e.target.value || null)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pitch-perfect"
            >
              <option value="">Choose a recording...</option>
              {sessionsWithAudio.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} - {new Date(session.date).toLocaleDateString("pl-PL")}
                </option>
              ))}
            </select>
          </div>

          {originalAudio && (
            <>
              {/* Waveforms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-card rounded-xl p-4 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Original</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={togglePlayOriginal}
                      className="gap-2"
                    >
                      {isPlayingOriginal ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      {isPlayingOriginal ? "Pause" : "Play"}
                    </Button>
                  </div>
                  {originalWaveform && (
                    <WaveformDisplay
                      waveformData={originalWaveform}
                      color="hsl(var(--muted-foreground))"
                      height={100}
                    />
                  )}
                </div>

                <div className="bg-card rounded-xl p-4 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Processed</h3>
                    {processedAudio && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={togglePlayProcessed}
                        className="gap-2"
                      >
                        {isPlayingProcessed ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {isPlayingProcessed ? "Pause" : "Play"}
                      </Button>
                    )}
                  </div>
                  {processedWaveform ? (
                    <WaveformDisplay
                      waveformData={processedWaveform}
                      color="hsl(var(--pitch-perfect))"
                      height={100}
                    />
                  ) : (
                    <div className="h-[100px] flex items-center justify-center bg-secondary/20 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        Select a preset or adjust settings, then click Process
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Presets */}
              <div className="bg-card rounded-xl p-4 border border-border">
                <h3 className="font-semibold mb-3">Presets</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  <button
                    onClick={() => handlePresetChange("custom")}
                    className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                      selectedPreset === "custom"
                        ? "bg-pitch-perfect/20 border-pitch-perfect text-pitch-perfect"
                        : "border-border hover:border-pitch-perfect/50"
                    }`}
                  >
                    Custom
                  </button>
                  {Object.entries(PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      onClick={() => handlePresetChange(key)}
                      className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                        selectedPreset === key
                          ? "bg-pitch-perfect/20 border-pitch-perfect text-pitch-perfect"
                          : "border-border hover:border-pitch-perfect/50"
                      }`}
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                {selectedPreset !== "custom" && PRESETS[selectedPreset] && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {PRESETS[selectedPreset].description}
                  </p>
                )}
              </div>

              {/* Settings */}
              <div className="bg-card rounded-xl p-4 border border-border space-y-4">
                <h3 className="font-semibold">Settings</h3>

                {/* Compressor */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Compression</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Threshold: {settings.threshold.toFixed(1)} dB
                      </label>
                      <input
                        type="range"
                        min="-60"
                        max="0"
                        step="1"
                        value={settings.threshold}
                        onChange={(e) => updateSetting("threshold", parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Ratio: {settings.ratio.toFixed(1)}:1
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="0.5"
                        value={settings.ratio}
                        onChange={(e) => updateSetting("ratio", parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* EQ */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">EQ</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Bass: {settings.lowShelfGain > 0 ? '+' : ''}{settings.lowShelfGain.toFixed(1)} dB
                      </label>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={settings.lowShelfGain}
                        onChange={(e) => updateSetting("lowShelfGain", parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Mid: {settings.midGain > 0 ? '+' : ''}{settings.midGain.toFixed(1)} dB
                      </label>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={settings.midGain}
                        onChange={(e) => updateSetting("midGain", parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Treble: {settings.highShelfGain > 0 ? '+' : ''}{settings.highShelfGain.toFixed(1)} dB
                      </label>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={settings.highShelfGain}
                        onChange={(e) => updateSetting("highShelfGain", parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Reverb & Output */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Effects & Output</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Reverb: {settings.reverbMix.toFixed(0)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={settings.reverbMix}
                        onChange={(e) => updateSetting("reverbMix", parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Output Gain: {(settings.outputGain * 100).toFixed(0)}%
                      </label>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.05"
                        value={settings.outputGain}
                        onChange={(e) => updateSetting("outputGain", parseFloat(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="flex-1 gap-2"
                  size="lg"
                >
                  <Sparkles className="w-4 h-4" />
                  {isProcessing ? "Processing..." : "Process Audio"}
                </Button>

                {processedAudio && (
                  <>
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      className="gap-2"
                      size="lg"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                    <Button
                      onClick={() => {
                        setProcessedAudio(null)
                        setProcessedWaveform(null)
                        setProcessedAudioEl(null)
                      }}
                      variant="outline"
                      size="lg"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
