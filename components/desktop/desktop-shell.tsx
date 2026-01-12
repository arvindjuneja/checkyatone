"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { type PitchData } from "@/lib/pitch-detector"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { DesktopNav } from "./desktop-nav"
import { DesktopRightPanel } from "./desktop-right-panel"
import { PitchVisualizer } from "@/components/pitch-visualizer"
import { CircleVisualizer } from "@/components/circle-visualizer"
import { TimelineAnalysis } from "@/components/timeline-analysis"
import { TrainingHub } from "@/components/training-hub"
import { CommandPalette } from "@/components/command-palette"
import { SessionLibrary } from "@/components/session-library"
import { useHotkeys } from "@/hooks/use-hotkeys"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { Music2, AlertCircle, Maximize2, Minimize2, HelpCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface DesktopShellProps {
  activeTab: "live" | "analysis" | "training" | "why"
  setActiveTab: (tab: "live" | "analysis" | "training" | "why") => void
  visualizationMode: "timeline" | "circle"
  setVisualizationMode: (mode: "timeline" | "circle") => void
  isRecording: boolean
  isPaused: boolean
  currentPitch: PitchData | null
  pitchHistory: PitchData[]
  recordingDuration: number
  error: string | null
  startRecording: () => void
  stopRecording: () => void
  togglePause: () => void
  reset: () => void
  hasRecording: boolean
  gain: number
  sensitivity: number
  updateGain: (value: number) => void
  updateSensitivity: (value: number) => void
}

export function DesktopShell(props: DesktopShellProps) {
  const {
    activeTab,
    setActiveTab,
    visualizationMode,
    setVisualizationMode,
    isRecording,
    isPaused,
    currentPitch,
    pitchHistory,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    togglePause,
  } = props

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [trainingMode, setTrainingMode] = useState<"menu" | "exercises" | "game" | "singalong">("menu")
  
  const { saveSession } = useSessionLibrary()
  const recordingStartTimeRef = useRef<number | null>(null)
  const wasRecordingRef = useRef(false)

  // Save panel sizes to localStorage
  const [leftPanelSize, setLeftPanelSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("desktop-left-panel-size")
      return saved ? parseFloat(saved) : 20
    }
    return 20
  })

  const [rightPanelSize, setRightPanelSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("desktop-right-panel-size")
      return saved ? parseFloat(saved) : 25
    }
    return 25
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("desktop-left-panel-size", leftPanelSize.toString())
    }
  }, [leftPanelSize])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("desktop-right-panel-size", rightPanelSize.toString())
    }
  }, [rightPanelSize])

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => !prev)
  }, [])

  const handleTrainingModeSelect = useCallback((mode: "exercises" | "game" | "singalong") => {
    setTrainingMode(mode)
  }, [])

  // Auto-save session when recording stops
  useEffect(() => {
    if (isRecording && !wasRecordingRef.current) {
      // Recording just started
      recordingStartTimeRef.current = Date.now()
    }
    
    if (!isRecording && wasRecordingRef.current && pitchHistory.length > 0) {
      // Recording just stopped
      const duration = recordingStartTimeRef.current 
        ? Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)
        : recordingDuration
      
      saveSession(pitchHistory, activeTab === "training" ? "training" : "live", duration)
      recordingStartTimeRef.current = null
    }
    
    wasRecordingRef.current = isRecording
  }, [isRecording, pitchHistory, saveSession, activeTab, recordingDuration])

  // Hotkeys
  useHotkeys([
    {
      key: "1",
      handler: () => setActiveTab("live"),
      description: "Przełącz na Na żywo",
      preventDefault: true,
    },
    {
      key: "2",
      handler: () => setActiveTab("training"),
      description: "Przełącz na Trenuj",
      preventDefault: true,
    },
    {
      key: "3",
      handler: () => setActiveTab("analysis"),
      description: "Przełącz na Analiza",
      preventDefault: true,
    },
    {
      key: "4",
      handler: () => setActiveTab("why"),
      description: "Przełącz na Po co?",
      preventDefault: true,
    },
    {
      key: "r",
      handler: () => {
        if (isRecording) {
          stopRecording()
        } else {
          startRecording()
        }
      },
      description: "Start/Stop nagrywania",
      preventDefault: true,
    },
    {
      key: " ",
      handler: () => {
        if (isRecording) {
          togglePause()
        }
      },
      description: "Pauza/Wznów",
      preventDefault: true,
      allowInInput: false,
    },
    {
      key: "f",
      handler: toggleFocusMode,
      description: "Focus mode",
      preventDefault: true,
    },
    {
      key: "k",
      handler: () => setCommandPaletteOpen(true),
      description: "Otwórz command palette",
      preventDefault: true,
      allowInInput: false,
    },
    {
      key: "?",
      handler: () => setShowHelp((prev) => !prev),
      description: "Pokaż skróty",
      preventDefault: true,
    },
  ])

  // Command+K / Ctrl+K for command palette
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandPaletteOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-pitch-perfect flex items-center justify-center">
            <Music2 className="w-4 h-4 text-background" />
          </div>
          <div>
            <h1 className="font-bold text-sm">Vocal Coach</h1>
            <a
              href="https://instagram.com/arvindspiewa"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              @arvindspiewa
            </a>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleFocusMode}
            title="Focus mode (F)"
          >
            {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowHelp(!showHelp)}
            title="Skróty klawiszowe (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCommandPaletteOpen(true)}
            className="gap-2"
          >
            <span className="text-xs">Cmd+K</span>
          </Button>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="px-4 py-2">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Help Overlay */}
      {showHelp && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-6 max-w-2xl w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Skróty klawiszowe</h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setShowHelp(false)}>
                ✕
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Nawigacja</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Na żywo</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">1</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Trenuj</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">2</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Analiza</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">3</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Po co?</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">4</kbd>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Nagrywanie</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Start/Stop</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">R</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Pauza/Wznów</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">Space</kbd>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Widok</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Focus mode</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">F</kbd>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-sm text-muted-foreground">Inne</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Command Palette</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">Cmd+K</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Pomoc</span>
                    <kbd className="px-2 py-0.5 bg-secondary rounded text-xs">?</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content with Panels */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Left Navigation Panel */}
          {!focusMode && (
            <>
              <Panel
                defaultSize={leftPanelSize}
                minSize={15}
                maxSize={30}
                onResize={setLeftPanelSize}
                className="bg-card/30"
              >
                <DesktopNav
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  isRecording={isRecording}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
                  trainingMode={trainingMode}
                  onTrainingModeChange={setTrainingMode}
                  onOpenLibrary={() => setShowLibrary(true)}
                />
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            </>
          )}

          {/* Center Canvas */}
          <Panel minSize={30} className="bg-background">
            <div className="h-full overflow-y-auto p-6">
              {activeTab === "live" && (
                <div className="space-y-6 max-w-5xl mx-auto">
                  {/* Timeline Visualizer */}
                  <div className="bg-card rounded-xl p-6 border border-border">
                    <div className="mb-3 text-sm font-semibold text-muted-foreground">Timeline</div>
                    <div className="h-[320px]">
                      <PitchVisualizer
                        pitchHistory={pitchHistory}
                        currentPitch={currentPitch}
                        isRecording={isRecording}
                      />
                    </div>
                  </div>
                  {/* Circle Visualizer */}
                  <div className="bg-card rounded-xl p-6 border border-border">
                    <div className="mb-3 text-sm font-semibold text-muted-foreground">Koło</div>
                    <div className="flex justify-center">
                      <CircleVisualizer
                        pitchHistory={pitchHistory}
                        currentPitch={currentPitch}
                        isRecording={isRecording}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "training" && (
                <div className="max-w-5xl mx-auto">
                  <TrainingHub
                    currentPitch={currentPitch}
                    isRecordingActive={isRecording}
                    onStartRecording={startRecording}
                    onStopRecording={stopRecording}
                  />
                </div>
              )}

              {activeTab === "analysis" && (
                <div className="space-y-6 max-w-5xl mx-auto">
                  <TimelineAnalysis pitchHistory={pitchHistory} />
                  <div className="bg-card rounded-xl p-4 border border-border space-y-3">
                    <h3 className="font-semibold text-sm">Wskazówki</h3>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-pitch-perfect mt-1.5 shrink-0" />
                        <span>
                          <strong className="text-pitch-perfect">Zielony</strong> - śpiewasz idealnie w tonacji (±10
                          centów)
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-pitch-good mt-1.5 shrink-0" />
                        <span>
                          <strong className="text-pitch-good">Żółtozielony</strong> - jesteś blisko, ale lekko
                          odchylony (±25 centów)
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-pitch-off mt-1.5 shrink-0" />
                        <span>
                          <strong className="text-pitch-off">Czerwony</strong> - znaczące odchylenie od nuty ({">"}25
                          centów)
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === "why" && (
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
              )}
            </div>
          </Panel>

          {/* Right Inspector Panel */}
          {!focusMode && (
            <>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
              <Panel
                defaultSize={rightPanelSize}
                minSize={20}
                maxSize={35}
                onResize={setRightPanelSize}
                className="bg-card/30"
              >
                <DesktopRightPanel {...props} activeTab={activeTab} visualizationMode={visualizationMode} />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Session Library Dialog */}
      <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
        <DialogContent className="max-w-4xl h-[80vh] p-0">
          <SessionLibrary onClose={() => setShowLibrary(false)} />
        </DialogContent>
      </Dialog>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onTogglePause={togglePause}
        onReset={props.reset}
        onToggleFocusMode={toggleFocusMode}
        onSelectTrainingMode={handleTrainingModeSelect}
        isRecording={isRecording}
        isPaused={isPaused}
      />
    </div>
  )
}
