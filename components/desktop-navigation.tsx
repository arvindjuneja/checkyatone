"use client"

import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { DesktopNav } from "./desktop/desktop-nav"
import { DesktopRightPanel } from "./desktop/desktop-right-panel"
import { CommandPalette } from "./command-palette"
import { SessionLibrary } from "./session-library"
import { useHotkeys } from "@/hooks/use-hotkeys"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { Music2, AlertCircle, Maximize2, Minimize2, HelpCircle, PanelLeftClose, PanelRightClose, PanelLeft, PanelRight } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

interface DesktopNavigationProps {
  pathname: string
  children: ReactNode
}

export function DesktopNavigation({ pathname, children }: DesktopNavigationProps) {
  const router = useRouter()
  const {
    isRecording,
    isPaused,
    currentPitch,
    pitchHistory,
    recordingDuration,
    error,
    startRecording,
    stopRecording,
    togglePause,
    reset,
    gain,
    sensitivity,
    updateGain,
    updateSensitivity,
    saveAudioToSession,
  } = useAudioRecorderContext()

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showLeftPanel, setShowLeftPanel] = useState(true)

  // Routes that need the right panel (recording controls, audio settings)
  const routesNeedingRightPanel = ["/record/live", "/record/karaoke", "/edit/studio"]
  const routeNeedsRightPanel = routesNeedingRightPanel.some(route => pathname.startsWith(route))
  const [showRightPanel, setShowRightPanel] = useState(routeNeedsRightPanel)

  // Auto-show right panel on routes that need it, auto-hide on others
  useEffect(() => {
    setShowRightPanel(routeNeedsRightPanel)
  }, [pathname, routeNeedsRightPanel])

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
    const newFocusMode = !focusMode
    setFocusMode(newFocusMode)
    // When entering focus mode, hide both panels
    if (newFocusMode) {
      setShowLeftPanel(false)
      setShowRightPanel(false)
    } else {
      // When exiting, show both panels
      setShowLeftPanel(true)
      setShowRightPanel(true)
    }
  }, [focusMode])

  // Auto-save session when recording stops
  useEffect(() => {
    if (isRecording && !wasRecordingRef.current) {
      recordingStartTimeRef.current = Date.now()
    }

    if (!isRecording && wasRecordingRef.current && pitchHistory.length > 0) {
      // Wait for MediaRecorder's onstop event to fire and set the audioBlob
      const timer = setTimeout(async () => {
        const duration = recordingStartTimeRef.current
          ? Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)
          : recordingDuration

        const sessionType = pathname.startsWith("/training") ? "training" : "live"

        // Save session with hasAudio flag
        const sessionId = saveSession(pitchHistory, sessionType, duration, undefined, true)

        // Also save audio if available (wait a moment for audioBlob to be ready)
        if (sessionId) {
          const saved = await saveAudioToSession(sessionId)
          if (!saved) {
            console.warn("Audio not saved for session:", sessionId)
          }
        }

        recordingStartTimeRef.current = null
      }, 300) // Give MediaRecorder's onstop event time to fire

      return () => clearTimeout(timer)
    }

    wasRecordingRef.current = isRecording
  }, [isRecording, pitchHistory, saveSession, pathname, recordingDuration, saveAudioToSession])

  // Hotkeys
  useHotkeys([
    {
      key: "1",
      handler: () => router.push("/"),
      description: "Przełącz na Na żywo",
      preventDefault: true,
    },
    {
      key: "2",
      handler: () => router.push("/training"),
      description: "Przełącz na Trenuj",
      preventDefault: true,
    },
    {
      key: "3",
      handler: () => router.push("/progress"),
      description: "Przełącz na Postępy",
      preventDefault: true,
    },
    {
      key: "4",
      handler: () => router.push("/analysis"),
      description: "Przełącz na Analiza",
      preventDefault: true,
    },
    {
      key: "5",
      handler: () => router.push("/studio"),
      description: "Przełącz na Studio",
      preventDefault: true,
    },
    {
      key: "6",
      handler: () => router.push("/karaoke"),
      description: "Przełącz na Karaoke",
      preventDefault: true,
    },
    {
      key: "7",
      handler: () => router.push("/about"),
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
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            title="Toggle left sidebar"
          >
            {showLeftPanel ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowRightPanel(!showRightPanel)}
            title="Toggle right sidebar"
          >
            {showRightPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRight className="w-4 h-4" />}
          </Button>
          <div className="w-px h-4 bg-border" />
          <Button variant="ghost" size="icon-sm" onClick={toggleFocusMode} title="Focus mode (F)">
            {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setShowHelp(!showHelp)} title="Skróty klawiszowe (?)">
            <HelpCircle className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCommandPaletteOpen(true)} className="gap-2">
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
          {showLeftPanel && (
            <>
              <Panel
                defaultSize={leftPanelSize}
                minSize={15}
                maxSize={30}
                onResize={setLeftPanelSize}
                className="bg-card/30"
              >
                <DesktopNav
                  pathname={pathname}
                  isRecording={isRecording}
                  onStartRecording={startRecording}
                  onStopRecording={stopRecording}
                  onOpenLibrary={() => setShowLibrary(true)}
                />
              </Panel>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
            </>
          )}

          {/* Center Canvas */}
          <Panel minSize={30} className="bg-background">
            <div className="h-full overflow-y-auto p-6">{children}</div>
          </Panel>

          {/* Right Inspector Panel */}
          {showRightPanel && (
            <>
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
              <Panel
                defaultSize={rightPanelSize}
                minSize={20}
                maxSize={35}
                onResize={setRightPanelSize}
                className="bg-card/30"
              >
                <DesktopRightPanel
                  pathname={pathname}
                  isRecording={isRecording}
                  isPaused={isPaused}
                  currentPitch={currentPitch}
                  pitchHistory={pitchHistory}
                  recordingDuration={recordingDuration}
                  hasRecording={pitchHistory.length > 0}
                  startRecording={startRecording}
                  stopRecording={stopRecording}
                  togglePause={togglePause}
                  reset={reset}
                  gain={gain}
                  sensitivity={sensitivity}
                  updateGain={updateGain}
                  updateSensitivity={updateSensitivity}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* Session Library Dialog */}
      <Dialog open={showLibrary} onOpenChange={setShowLibrary}>
        <DialogContent className="max-w-4xl h-[80vh] p-0">
          <DialogTitle className="sr-only">Biblioteka sesji</DialogTitle>
          <SessionLibrary onClose={() => setShowLibrary(false)} />
        </DialogContent>
      </Dialog>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        pathname={pathname}
        onNavigate={(path) => router.push(path)}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onTogglePause={togglePause}
        onReset={reset}
        onToggleFocusMode={toggleFocusMode}
        isRecording={isRecording}
        isPaused={isPaused}
      />
    </div>
  )
}
