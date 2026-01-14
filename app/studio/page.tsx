"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
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
import { MultiTrackManager } from "@/components/multi-track-manager"
import { MultiTrackTimeline } from "@/components/timeline/multi-track-timeline"
import { Button } from "@/components/ui/button"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Download, Play, Pause, RotateCcw, Sparkles, Mic, Square, Save, Upload, Edit3, ChevronDown, ChevronUp, Layers } from "lucide-react"
import { createProject, type MultiTrackProject, multiTrackStorage } from "@/lib/multi-track-storage"

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

  // Multi-track mode
  const [isMultiTrackMode, setIsMultiTrackMode] = useState(false)
  const [currentProject, setCurrentProject] = useState<MultiTrackProject | null>(null)
  const [projects, setProjects] = useState<MultiTrackProject[]>([])

  // Studio recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // File upload
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Auto-collapse sections when audio is loaded
  useEffect(() => {
    if (originalAudio && !isLoadingAudio && !audioError) {
      setShowLoadControls(false)
      setShowSessionSelector(false)
    }
  }, [originalAudio, isLoadingAudio, audioError])

  useEffect(() => {
    document.title = "Vocal Coach - Studio"
    trackPageView("Vocal Coach - Studio", "/studio")

    // Load karaoke audio from localStorage if source=karaoke
    const source = searchParams.get("source")
    if (source === "karaoke") {
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
            setAudioError("Nie udało się załadować nagrania karaoke")
          })
      }
    }

    // Load multi-track projects
    loadProjects()
  }, [searchParams])

  // Load multi-track projects
  const loadProjects = async () => {
    try {
      const allProjects = await multiTrackStorage.getAllProjects()
      setProjects(allProjects.sort((a, b) => b.updatedAt - a.updatedAt))
    } catch (error) {
      console.error("[Studio] Failed to load projects:", error)
    }
  }

  // Create new multi-track project
  const handleCreateProject = async () => {
    try {
      const projectId = await createProject(`Project ${projects.length + 1}`)
      await loadProjects()
      const newProject = await multiTrackStorage.getProject(projectId)
      if (newProject) {
        setCurrentProject(newProject)
        setIsMultiTrackMode(true)
      }
      trackEvent("multitrack_project_created", "Studio")
    } catch (error) {
      console.error("[Studio] Failed to create project:", error)
    }
  }

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
          setAudioError("Nie znaleziono nagrania audio dla tej sesji. Spróbuj nagrać nową sesję.")
        }
      } catch (error) {
        console.error("Failed to load audio:", error)
        setAudioError("Błąd podczas ładowania audio: " + (error as Error).message)
      } finally {
        setIsLoadingAudio(false)
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
    if (!originalAudioEl) return

    if (isPlayingOriginal) {
      originalAudioEl.pause()
      setIsPlayingOriginal(false)
    } else {
      try {
        // Ensure audio is loaded before playing
        if (originalAudioEl.readyState < 3) {
          console.log("Audio not ready, loading...")
          await originalAudioEl.load()
        }

        await originalAudioEl.play()
        setIsPlayingOriginal(true)

        originalAudioEl.onended = () => setIsPlayingOriginal(false)
      } catch (error) {
        console.error("Failed to play audio:", error)
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" })

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
      setAudioError("Nie udało się rozpocząć nagrywania. Sprawdź uprawnienia mikrofonu.")
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
      const error = "Proszę wybrać plik audio (mp3, wav, webm, etc.)"
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
      setAudioError("Błąd podczas ładowania pliku: " + (error as Error).message)
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-pitch-perfect" />
            Recording Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            {isMultiTrackMode ? "Multi-track recording and mixing" : "Enhance your recordings with professional audio processing"}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-2 bg-secondary rounded-lg p-1">
          <Button
            variant={!isMultiTrackMode ? "default" : "ghost"}
            size="sm"
            onClick={() => setIsMultiTrackMode(false)}
            className="gap-2"
          >
            <Edit3 className="w-3 h-3" />
            Single Track
          </Button>
          <Button
            variant={isMultiTrackMode ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              if (!currentProject) {
                handleCreateProject()
              } else {
                setIsMultiTrackMode(true)
              }
            }}
            className="gap-2"
          >
            <Layers className="w-3 h-3" />
            Multi-Track
          </Button>
        </div>
      </div>

      {/* Multi-Track Mode */}
      {isMultiTrackMode && currentProject ? (
        <MultiTrackTimeline
          project={currentProject}
          onProjectUpdate={loadProjects}
        />
      ) : isMultiTrackMode ? (
        <div className="bg-card rounded-xl p-8 border border-border text-center space-y-4">
          <p className="text-muted-foreground">No project selected</p>
          <Button onClick={handleCreateProject} className="gap-2">
            <Layers className="w-4 h-4" />
            Create New Project
          </Button>
          {projects.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3">Or load existing:</h3>
              <div className="space-y-2">
                {projects.map(project => (
                  <Button
                    key={project.id}
                    variant="outline"
                    onClick={() => setCurrentProject(project)}
                    className="w-full justify-start"
                  >
                    {project.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Single Track Mode - Existing UI */}

      {/* Recording Controls - Collapsible */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setShowLoadControls(!showLoadControls)}
        >
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-sm">Load Audio</h3>
            {originalAudio && !isRecording && (
              <span className="text-xs text-pitch-perfect bg-pitch-perfect/10 px-2 py-1 rounded">
                ✓ Ready
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
                    Record
                  </Button>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoadingAudio}
                    variant="outline"
                    className="gap-2"
                    size="sm"
                  >
                    <Upload className="w-3 h-3" />
                    Upload File
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
                  Stop Recording
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Select Recording - Collapsible - only show if there are sessions with audio */}
      {sessionsWithAudio.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setShowSessionSelector(!showSessionSelector)}
          >
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-sm">Previous Recordings</h3>
              {selectedSessionId && (
                <span className="text-xs text-pitch-perfect bg-pitch-perfect/10 px-2 py-1 rounded">
                  ✓ Selected
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
                <option value="">Select recording...</option>
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

      {/* Loading state */}
      {isLoadingAudio && (
        <div className="bg-card rounded-xl p-8 border border-border text-center">
          <div className="animate-spin w-8 h-8 border-4 border-pitch-perfect border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground">Ładowanie audio...</p>
        </div>
      )}

      {/* Error state */}
      {audioError && (
        <div className="bg-destructive/10 border border-destructive/50 rounded-xl p-6 text-center">
          <p className="text-destructive font-semibold mb-2">Błąd</p>
          <p className="text-sm text-muted-foreground">{audioError}</p>
          <p className="text-xs text-muted-foreground mt-4">
            💡 Wskazówka: Ta sesja może być stara. Nagraj nową sesję na stronie "Na żywo" aby użyć Studio.
          </p>
        </div>
      )}

      {/* Debug Status */}
      <div className="bg-secondary/20 rounded-lg p-2 text-xs font-mono">
        Audio: {originalAudio ? '✓' : '✗'} | Loading: {isLoadingAudio ? '✓' : '✗'} | Error: {audioError ? 'YES' : 'NO'} | Waveform: {originalWaveform ? '✓' : '✗'}
      </div>

      {/* Main processing UI - show when audio is loaded */}
      {originalAudio && !isLoadingAudio && !audioError && (
            <>
              {/* Waveforms */}
              <div className="space-y-4">
                {/* Edit Mode Toggle */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Audio Editor</h3>
                  <Button
                    onClick={() => setEditingMode(!editingMode)}
                    variant={editingMode ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                  >
                    <Edit3 className="w-3 h-3" />
                    {editingMode ? "Editing Mode" : "Enable Editing"}
                  </Button>
                </div>

                {/* Interactive Waveform (Editing Mode) */}
                {editingMode ? (
                  <div className="bg-card rounded-xl p-4 border border-border">
                    <InteractiveWaveform
                      audioBlob={originalAudio}
                      onAudioEdited={handleAudioEdited}
                      color="#3b82f6"
                      height={150}
                    />
                  </div>
                ) : (
                  /* Simple Waveform View */
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
                          color="#6b7280"
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
                          color="#3b82f6"
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
                )}
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
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleProcess}
                  disabled={isProcessing || isRecording}
                  className="flex-1 gap-2"
                  size="lg"
                >
                  <Sparkles className="w-4 h-4" />
                  {isProcessing ? "Przetwarzanie..." : "Przetwórz Audio"}
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
        </>
      )}
    </div>
  )
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Ładowanie...</div>}>
      <StudioContent />
    </Suspense>
  )
}
