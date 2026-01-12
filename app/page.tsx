"use client"

import { useState, useEffect } from "react"
import { useAudioRecorder } from "@/hooks/use-audio-recorder"
import { trackPageView } from "@/lib/analytics"
import { MobileShell } from "@/components/mobile-shell"
import { DesktopShell } from "@/components/desktop/desktop-shell"

export default function VocalAnalyzerPage() {
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
    hasRecording,
    gain,
    sensitivity,
    updateGain,
    updateSensitivity,
  } = useAudioRecorder()

  const [activeTab, setActiveTab] = useState<"live" | "analysis" | "training" | "why">("live")
  const [visualizationMode, setVisualizationMode] = useState<"timeline" | "circle">("timeline")
  const [isDesktop, setIsDesktop] = useState(false)

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024) // lg breakpoint
    }
    
    checkScreenSize()
    window.addEventListener("resize", checkScreenSize)
    
    return () => window.removeEventListener("resize", checkScreenSize)
  }, [])

  // Track page views when tab changes
  useEffect(() => {
    const titles = {
      live: "Vocal Coach - Na żywo",
      analysis: "Vocal Coach - Analiza",
      training: "Vocal Coach - Trenuj",
      why: "Vocal Coach - Po co?",
    }
    const title = titles[activeTab]
    document.title = title
    trackPageView(title, `/${activeTab}`)
  }, [activeTab])

  const sharedProps = {
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
    reset,
    hasRecording,
    gain,
    sensitivity,
    updateGain,
    updateSensitivity,
  }

  return isDesktop ? <DesktopShell {...sharedProps} /> : <MobileShell {...sharedProps} />
}
