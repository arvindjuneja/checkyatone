"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
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
import { InteractiveWaveform } from "@/components/interactive-waveform"
import { Button } from "@/components/ui/button"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Download, Play, Pause, RotateCcw, Sparkles, Mic, Square, Upload, Edit3, ChevronDown, ChevronUp, Layers, Radio, FolderOpen } from "lucide-react"

type StudioMode = "select" | "quick" | "multitrack"

function StudioContent() {
  const searchParams = useSearchParams()
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
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)

  const [originalAudioEl, setOriginalAudioEl] = useState<HTMLAudioElement | null>(null)
  const [processedAudioEl, setProcessedAudioEl] = useState<HTMLAudioElement | null>(null)

  // Editing mode
  const [editingMode, setEditingMode] = useState(false)

  // UI collapse states
  const [showLoadControls, setShowLoadControls] = useState(true)
  const [showSessionSelector, setShowSessionSelector] = useState(true)

  // Studio recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // File upload
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Studio mode - show selector initially unless we have a session or source param
  const [studioMode, setStudioMode] = useState<StudioMode>("select")

  // Real-time preview with Web Audio API
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const lowShelfRef = useRef<BiquadFilterNode | null>(null)
  const midPeakRef = useRef<BiquadFilterNode | null>(null)
  const highShelfRef = useRef<BiquadFilterNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const [previewEnabled, setPreviewEnabled] = useState(true)

  // Auto-collapse sections when audio is loaded
  useEffect(() => {
    if (originalAudio && !isLoadingAudio && !audioError) {
      setShowLoadControls(false)
      setShowSessionSelector(false)
    }
  }, [originalAudio, isLoadingAudio, audioError])

  useEffect(() => {
    document.title = "Vocal Coach - Studio"
    trackPageView("Vocal Coach - Studio", "/edit/studio")

    // Check if we have a session param - go straight to quick mode
    const sessionParam = searchParams.get("session")
    if (sessionParam) {
      setStudioMode("quick")
      setSelectedSessionId(sessionParam)
      return
    }

    // Load karaoke audio from localStorage if source=karaoke
    const source = searchParams.get("source")
    if (source === "karaoke") {
      setStudioMode("quick")
      const karaokeData = localStorage.getItem("karaoke-temp-audio")
      if (karaokeData) {
        console.log("[Studio] Loading karaoke audio from localStorage")

        // Convert data URL to blob
        fetch(karaokeData)
          .then(res => res.blob())
          .then(async (blob) => {
            console.log("[Studio] Karaoke audio loaded, size:", blob.size)
            setOriginalAudio(blob)

            // Generate waveform
            const waveform = await getWaveformData(blob)
            setOriginalWaveform(waveform)

            // Create audio element
            const audioURL = URL.createObjectURL(blob)
            const audio = new Audio(audioURL)
            audio.preload = "auto"
            audio.load()
            setOriginalAudioEl(audio)

            // Clean up
            localStorage.removeItem("karaoke-temp-audio")
            console.log("[Studio] Karaoke audio ready for processing!")
          })
          .catch(err => {
            console.error("[Studio] Failed to load karaoke audio:", err)
            setAudioError("Nie udalo sie zaladowac nagrania karaoke")
          })
      }
    }
  }, [searchParams])

  // Load audio when session is selected
  useEffect(() => {
    if (!selectedSessionId) {
      setOriginalAudio(null)
      setOriginalWaveform(null)
      setProcessedAudio(null)
      setProcessedWaveform(null)
      setAudioError(null)
      return
    }

    const loadAudio = async () => {
      setIsLoadingAudio(true)
      setAudioError(null)
      try {
        console.log("Loading audio for session:", selectedSessionId)
        const audioBlob = await getSessionAudio(selectedSessionId)

        if (audioBlob) {
          console.log("Audio blob loaded, size:", audioBlob.size)
          setOriginalAudio(audioBlob)

          const waveform = await getWaveformData(audioBlob)
          console.log("Waveform generated, samples:", waveform.length)
          setOriginalWaveform(waveform)

          // Create audio element for playback with preload
          const audioURL = URL.createObjectURL(audioBlob)
          const audio = new Audio(audioURL)
          audio.preload = "auto"

          // Force load to prevent lag
          audio.load()

          audio.addEventListener("canplaythrough", () => {
            console.log("Audio ready to play")
          })

          setOriginalAudioEl(audio)
        } else {
          console.error("No audio blob found for session:", selectedSessionId)
          setAudioError("Nie znaleziono nagrania audio dla tej sesji. Sprobuj nagrac nowa sesje.")
        }
      } catch (error) {
        console.error("Failed to load audio:", error)
        setAudioError("Blad podczas ladowania audio: " + (error as Error).message)
      } finally {
        setIsLoadingAudio(false)
      }
    }

    loadAudio()
  }, [selectedSessionId])

  // Get sessions with audio
  const sessionsWithAudio = sessions.filter(s => s.hasAudio)

  // Setup real-time preview processing chain
  const setupPreviewChain = (audioEl: HTMLAudioElement) => {
    try {
      if (sourceNodeRef.current) return // Already set up

      console.log("[Preview] Setting up audio processing chain...")
      const ctx = new AudioContext()
      audioContextRef.current = ctx

      // Create source from audio element
      const source = ctx.createMediaElementSource(audioEl)
      sourceNodeRef.current = source

      // Create processing nodes
      const compressor = ctx.createDynamicsCompressor()
      compressorRef.current = compressor

      const lowShelf = ctx.createBiquadFilter()
      lowShelf.type = "lowshelf"
      lowShelf.frequency.value = 200
      lowShelfRef.current = lowShelf

      const midPeak = ctx.createBiquadFilter()
      midPeak.type = "peaking"
      midPeak.frequency.value = 1000
      midPeak.Q.value = 1
      midPeakRef.current = midPeak

      const highShelf = ctx.createBiquadFilter()
      highShelf.type = "highshelf"
      highShelf.frequency.value = 3000
      highShelfRef.current = highShelf

      const gainNode = ctx.createGain()
      gainNodeRef.current = gainNode

      // Connect the chain: source -> compressor -> lowShelf -> midPeak -> highShelf -> gain -> destination
      source.connect(compressor)
      compressor.connect(lowShelf)
      lowShelf.connect(midPeak)
      midPeak.connect(highShelf)
      highShelf.connect(gainNode)
      gainNode.connect(ctx.destination)

      // Apply initial settings
      updatePreviewSettings()
      console.log("[Preview] Chain setup complete")
    } catch (error) {
      console.error("[Preview] Failed to setup chain:", error)
    }
  }

  // Update preview processing settings in real-time
  const updatePreviewSettings = () => {
    if (!compressorRef.current) return

    const comp = compressorRef.current
    comp.threshold.value = settings.threshold
    comp.knee.value = settings.knee
    comp.ratio.value = settings.ratio
    comp.attack.value = settings.attack
    comp.release.value = settings.release

    if (lowShelfRef.current) {
      lowShelfRef.current.gain.value = settings.lowShelfGain
    }
    if (midPeakRef.current) {
      midPeakRef.current.gain.value = settings.midGain
    }
    if (highShelfRef.current) {
      highShelfRef.current.gain.value = settings.highShelfGain
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = settings.outputGain
    }
  }

  // Update preview settings when they change
  useEffect(() => {
    updatePreviewSettings()
  }, [settings])

  // Reset audio context when preview is toggled (to properly connect/disconnect processing)
  useEffect(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
      sourceNodeRef.current = null

      // Recreate audio element since MediaElementSourceNode takes it over
      if (originalAudio && originalAudioEl) {
        const audioURL = URL.createObjectURL(originalAudio)
        const audio = new Audio(audioURL)
        audio.preload = "auto"
        audio.load()
        setOriginalAudioEl(audio)
      }
    }
  }, [previewEnabled])

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

      // Create audio element for playback with preload
      const audioURL = URL.createObjectURL(processed)
      const audio = new Audio(audioURL)
      audio.preload = "auto"

      // Force load to prevent lag
      audio.load()

      audio.addEventListener("canplaythrough", () => {
        console.log("Processed audio ready to play")
      })

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

  const togglePlayOriginal = async () => {
    if (!originalAudioEl) {
      console.log("[Play] No audio element")
      return
    }

    if (isPlayingOriginal) {
      console.log("[Play] Pausing...")
      originalAudioEl.pause()
      setIsPlayingOriginal(false)
    } else {
      try {
        console.log("[Play] Starting playback, preview:", previewEnabled)

        // Setup real-time preview chain if enabled
        if (previewEnabled && !sourceNodeRef.current) {
          setupPreviewChain(originalAudioEl)
        }

        // Resume AudioContext if suspended (browser autoplay policy)
        if (audioContextRef.current?.state === "suspended") {
          console.log("[Play] Resuming suspended AudioContext...")
          await audioContextRef.current.resume()
        }

        // Reset to beginning if at end
        if (originalAudioEl.ended || originalAudioEl.currentTime >= originalAudioEl.duration) {
          originalAudioEl.currentTime = 0
        }

        console.log("[Play] Playing audio, readyState:", originalAudioEl.readyState)
        const playPromise = originalAudioEl.play()
        if (playPromise) {
          await playPromise
        }
        setIsPlayingOriginal(true)

        originalAudioEl.onended = () => {
          console.log("[Play] Playback ended")
          setIsPlayingOriginal(false)
        }
      } catch (error) {
        console.error("[Play] Failed to play audio:", error)
        setIsPlayingOriginal(false)
      }
    }
  }

  const togglePlayProcessed = async () => {
    if (!processedAudioEl) return

    if (isPlayingProcessed) {
      processedAudioEl.pause()
      setIsPlayingProcessed(false)
    } else {
      try {
        // Ensure audio is loaded before playing
        if (processedAudioEl.readyState < 3) {
          console.log("Processed audio not ready, loading...")
          await processedAudioEl.load()
        }

        await processedAudioEl.play()
        setIsPlayingProcessed(true)

        processedAudioEl.onended = () => setIsPlayingProcessed(false)
      } catch (error) {
        console.error("Failed to play processed audio:", error)
        setIsPlayingProcessed(false)
      }
    }
  }

  const updateSetting = <K extends keyof AudioProcessingSettings>(
    key: K,
    value: AudioProcessingSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSelectedPreset("custom") // Switch to custom when manually adjusting
  }

  const handleAudioEdited = async (editedBlob: Blob) => {
    console.log("[Studio] Audio edited, updating original audio...")
    setOriginalAudio(editedBlob)

    // Reset audio context when audio changes (need new source node)
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
      sourceNodeRef.current = null
    }

    // Regenerate waveform
    const waveform = await getWaveformData(editedBlob)
    setOriginalWaveform(waveform)

    // Update audio element
    const audioURL = URL.createObjectURL(editedBlob)
    const audio = new Audio(audioURL)
    audio.preload = "auto"
    audio.load()
    setOriginalAudioEl(audio)

    // Clear processed audio since the source changed
    setProcessedAudio(null)
    setProcessedWaveform(null)
    setProcessedAudioEl(null)

    trackEvent("audio_edited", "Studio")
  }

  const startStudioRecording = async () => {
    try {
      // Request high quality audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 2 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      })

      // Try to use best available codec
      let mimeType = "audio/webm;codecs=opus"
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm"
      }
      console.log("[Studio] Recording with mimeType:", mimeType)

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000, // 128 kbps for good quality
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log("[Studio] Recording stopped, processing...")
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        console.log("[Studio] Audio blob created, size:", blob.size)

        // Set as original audio
        setOriginalAudio(blob)
        console.log("[Studio] Generating waveform for recording...")
        const waveform = await getWaveformData(blob)
        console.log("[Studio] Waveform generated, samples:", waveform.length)
        setOriginalWaveform(waveform)

        // Create audio element for playback with preload
        console.log("[Studio] Creating audio element for playback...")
        const audioURL = URL.createObjectURL(blob)
        const audio = new Audio(audioURL)
        audio.preload = "auto"
        audio.load() // Force load to prevent lag

        // Wait for audio to be loaded
        audio.addEventListener("canplaythrough", () => {
          console.log("[Studio] Recording audio ready to play")
        })

        audio.addEventListener("error", (e) => {
          console.error("[Studio] Recording audio element error:", e)
        })

        setOriginalAudioEl(audio)
        console.log("[Studio] Recording processing complete!")

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())

        trackEvent("studio_recording_completed", "Studio", undefined, recordingDuration)
      }

      mediaRecorder.start(100)
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setRecordingDuration(0)

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      trackEvent("studio_recording_started", "Studio")
    } catch (error) {
      console.error("Failed to start recording:", error)
      setAudioError("Nie udalo sie rozpoczac nagrywania. Sprawdz uprawnienia mikrofonu.")
    }
  }

  const stopStudioRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
      setIsRecording(false)

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }

      // Clear any selected session
      setSelectedSessionId(null)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    console.log("[Studio] File selected:", file.name, file.type, file.size)

    // Validate file type
    if (!file.type.startsWith("audio/")) {
      const error = "Prosze wybrac plik audio (mp3, wav, webm, etc.)"
      console.error("[Studio] Invalid file type:", file.type)
      setAudioError(error)
      return
    }

    try {
      setIsLoadingAudio(true)
      setAudioError(null)
      setSelectedSessionId(null) // Clear any selected session

      console.log("[Studio] Loading uploaded file...")

      // Convert file to blob
      const arrayBuffer = await file.arrayBuffer()
      console.log("[Studio] File read as ArrayBuffer, size:", arrayBuffer.byteLength)

      const blob = new Blob([arrayBuffer], { type: file.type })
      console.log("[Studio] Blob created, setting originalAudio...")
      setOriginalAudio(blob)

      // Generate waveform
      console.log("[Studio] Generating waveform...")
      const waveform = await getWaveformData(blob)
      console.log("[Studio] Waveform generated, samples:", waveform.length)
      setOriginalWaveform(waveform)

      // Create audio element for playback
      console.log("[Studio] Creating audio element...")
      const audioURL = URL.createObjectURL(blob)
      const audio = new Audio(audioURL)
      audio.preload = "auto"
      audio.load()

      audio.addEventListener("canplaythrough", () => {
        console.log("[Studio] Uploaded audio ready to play")
      })

      audio.addEventListener("error", (e) => {
        console.error("[Studio] Audio element error:", e)
      })

      setOriginalAudioEl(audio)
      console.log("[Studio] Upload complete!")

      trackEvent("audio_file_uploaded", "Studio", file.type)
    } catch (error) {
      console.error("[Studio] Failed to load uploaded file:", error)
      setAudioError("Blad podczas ladowania pliku: " + (error as Error).message)
    } finally {
      setIsLoadingAudio(false)
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const router = useRouter()

  // Mode selector screen
  if (studioMode === "select") {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center pt-8">
          <h1 className="text-3xl font-bold mb-2">Studio</h1>
          <p className="text-muted-foreground">
            Co chcesz dzisiaj stworzyc?
          </p>
        </div>

        {/* Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          {/* Quick Recording */}
          <button
            onClick={() => setStudioMode("quick")}
            className="group rounded-2xl border-2 border-border bg-card p-6 text-left hover:border-primary/50 hover:bg-accent/30 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Radio className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Szybkie nagranie</h3>
            <p className="text-sm text-muted-foreground">
              Nagraj, edytuj i przetworz pojedyncza sciezke audio
            </p>
          </button>

          {/* Multi-track DAW */}
          <button
            onClick={() => router.push("/edit/projects")}
            className="group rounded-2xl border-2 border-border bg-card p-6 text-left hover:border-primary/50 hover:bg-accent/30 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
              <Layers className="w-7 h-7 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Multi-track DAW</h3>
            <p className="text-sm text-muted-foreground">
              Profesjonalny edytor wielosciezkowy z szablonami (podcast, muzyka)
            </p>
          </button>

          {/* Load from Library */}
          <button
            onClick={() => {
              setStudioMode("quick")
              setShowSessionSelector(true)
              setShowLoadControls(false)
            }}
            className="group rounded-2xl border-2 border-border bg-card p-6 text-left hover:border-primary/50 hover:bg-accent/30 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
              <FolderOpen className="w-7 h-7 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Wczytaj nagranie</h3>
            <p className="text-sm text-muted-foreground">
              Otworz i edytuj wczesniej zapisane nagranie z biblioteki
            </p>
          </button>
        </div>

        {/* Recent sessions shortcut */}
        {sessionsWithAudio.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">OSTATNIE NAGRANIA</h3>
            <div className="space-y-2">
              {sessionsWithAudio.slice(0, 3).map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    setStudioMode("quick")
                    setSelectedSessionId(session.id)
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-accent/50 transition-colors text-left"
                >
                  <div>
                    <div className="font-medium">{session.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(session.date).toLocaleDateString("pl-PL")}
                    </div>
                  </div>
                  <Play className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Szybkie nagranie
          </h1>
          <p className="text-sm text-muted-foreground">
            Nagraj, edytuj i przetworz audio
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setStudioMode("select")
            setOriginalAudio(null)
            setProcessedAudio(null)
            setSelectedSessionId(null)
          }}
        >
          Zmien tryb
        </Button>
      </div>

      {/* Recording Controls - Collapsible - warm card */}
      <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setShowLoadControls(!showLoadControls)}
        >
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-sm">Zaladuj audio</h3>
            {originalAudio && !isRecording && (
              <span className="text-xs text-pitch-perfect bg-pitch-perfect/10 px-2 py-1 rounded">
                Gotowe
              </span>
            )}
            {isRecording && (
              <span className="text-xs font-mono font-bold text-pitch-perfect">
                {formatTime(recordingDuration)}
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="gap-1">
            {showLoadControls ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {showLoadControls && (
          <div className="p-4 pt-0 border-t border-border/50">
            <div className="flex items-center gap-2 flex-wrap">
              {!isRecording ? (
                <>
                  <Button
                    onClick={startStudioRecording}
                    disabled={isLoadingAudio}
                    className="gap-2"
                    size="sm"
                  >
                    <Mic className="w-3 h-3" />
                    Nagrywaj
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoadingAudio}
                    variant="outline"
                    className="gap-2"
                    size="sm"
                  >
                    <Upload className="w-3 h-3" />
                    Wgraj plik
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </>
              ) : (
                <Button
                  onClick={stopStudioRecording}
                  variant="destructive"
                  className="gap-2"
                  size="sm"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Select Recording - Collapsible - only show if there are sessions with audio */}
      {sessionsWithAudio.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm overflow-hidden">
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setShowSessionSelector(!showSessionSelector)}
          >
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-sm">Poprzednie nagrania</h3>
              {selectedSessionId && (
                <span className="text-xs text-pitch-perfect bg-pitch-perfect/10 px-2 py-1 rounded">
                  Wybrano
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="gap-1">
              {showSessionSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>

          {showSessionSelector && (
            <div className="p-4 pt-0 border-t border-border/50">
              <select
                value={selectedSessionId || ""}
                onChange={(e) => setSelectedSessionId(e.target.value || null)}
                disabled={isRecording}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pitch-perfect disabled:opacity-50"
              >
                <option value="">Wybierz nagranie...</option>
                {sessionsWithAudio.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} - {new Date(session.date).toLocaleDateString("pl-PL")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Loading state - warm styling */}
      {isLoadingAudio && (
        <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm p-8 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground">Ladowanie audio...</p>
        </div>
      )}

      {/* Error state - warm destructive styling */}
      {audioError && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-6 text-center">
          <p className="text-destructive font-semibold mb-2">Blad</p>
          <p className="text-sm text-muted-foreground">{audioError}</p>
          <p className="text-xs text-muted-foreground mt-4">
            Wskazowka: Ta sesja moze byc stara. Nagraj nowa sesje na stronie "Na zywo" aby uzyc Studio.
          </p>
        </div>
      )}

      {/* Main processing UI - show when audio is loaded */}
      {originalAudio && !isLoadingAudio && !audioError && (
        <>
          {/* Waveforms */}
          <div className="space-y-4">
            {/* Edit Mode Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Edytor audio</h3>
              <Button
                onClick={() => setEditingMode(!editingMode)}
                variant={editingMode ? "default" : "outline"}
                size="sm"
                className="gap-2"
              >
                <Edit3 className="w-3 h-3" />
                {editingMode ? "Tryb edycji" : "Wlacz edycje"}
              </Button>
            </div>

            {/* Interactive Waveform (Editing Mode) - warm card */}
            {editingMode ? (
              <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm p-5">
                <InteractiveWaveform
                  audioBlob={originalAudio}
                  onAudioEdited={handleAudioEdited}
                  color="#f97316"
                  height={150}
                />
              </div>
            ) : (
              /* Simple Waveform View - warm cards */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">Podglad na zywo</h3>
                      <button
                        onClick={() => setPreviewEnabled(!previewEnabled)}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                          previewEnabled
                            ? "bg-primary/20 text-primary"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {previewEnabled ? "Efekty ON" : "Efekty OFF"}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant={previewEnabled ? "default" : "outline"}
                      onClick={togglePlayOriginal}
                      className="gap-2"
                    >
                      {isPlayingOriginal ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      {isPlayingOriginal ? "Pauza" : "Odtwórz"}
                    </Button>
                  </div>
                  {originalWaveform && (
                    <WaveformDisplay
                      waveformData={originalWaveform}
                      color={previewEnabled ? "#f97316" : "#6b7280"}
                      height={100}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {previewEnabled
                      ? "Slyszysz efekty w czasie rzeczywistym - zmieniaj ustawienia i sluchaj!"
                      : "Slyszysz oryginal bez efektow"}
                  </p>
                </div>

                <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">Renderowany</h3>
                    {processedAudio && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={togglePlayProcessed}
                        className="gap-2"
                      >
                        {isPlayingProcessed ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {isPlayingProcessed ? "Pauza" : "Odtwórz"}
                      </Button>
                    )}
                  </div>
                  {processedWaveform ? (
                    <WaveformDisplay
                      waveformData={processedWaveform}
                      color="#22c55e"
                      height={100}
                    />
                  ) : (
                    <div className="h-[100px] flex items-center justify-center bg-secondary/20 rounded-lg">
                      <p className="text-xs text-muted-foreground">
                        Wybierz preset lub dostosuj ustawienia, nastepnie kliknij Przetworz
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Presets - warm card */}
          <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm p-5">
            <h3 className="font-semibold mb-3">Presety</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              <button
                onClick={() => handlePresetChange("custom")}
                className={`px-3 py-2 text-sm font-medium rounded-xl border transition-all ${
                  selectedPreset === "custom"
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-border/50 hover:border-primary/50"
                }`}
              >
                Wlasne
              </button>
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handlePresetChange(key)}
                  className={`px-3 py-2 text-sm font-medium rounded-xl border transition-all ${
                    selectedPreset === key
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border/50 hover:border-primary/50"
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

          {/* Settings - warm card */}
          <div className="rounded-2xl border border-border/50 bg-gradient-to-b from-card to-card/95 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold">Ustawienia</h3>

            {/* Compressor */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Kompresja</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Próg: {settings.threshold.toFixed(1)} dB
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
                    Bas: {settings.lowShelfGain > 0 ? '+' : ''}{settings.lowShelfGain.toFixed(1)} dB
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
                    Srodek: {settings.midGain > 0 ? '+' : ''}{settings.midGain.toFixed(1)} dB
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
                    Sopran: {settings.highShelfGain > 0 ? '+' : ''}{settings.highShelfGain.toFixed(1)} dB
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
              <h4 className="text-sm font-semibold text-muted-foreground">Efekty i wyjscie</h4>
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
                    Glosnosc: {(settings.outputGain * 100).toFixed(0)}%
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
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleProcess}
              disabled={isProcessing || isRecording}
              className="flex-1 gap-2"
              size="lg"
            >
              <Sparkles className="w-4 h-4" />
              {isProcessing ? "Przetwarzanie..." : "Przetworz Audio"}
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
                  Pobierz
                </Button>
                <Button
                  onClick={() => {
                    setProcessedAudio(null)
                    setProcessedWaveform(null)
                    setProcessedAudioEl(null)
                  }}
                  variant="outline"
                  size="lg"
                  title="Reset"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Ladowanie...</div>}>
      <StudioContent />
    </Suspense>
  )
}
