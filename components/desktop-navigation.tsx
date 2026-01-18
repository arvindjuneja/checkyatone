"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Link from "next/link"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import {
  Home,
  Mic,
  GraduationCap,
  Layers,
  Library,
  Music2,
  Settings,
  AlertCircle,
  ChevronDown,
  Flame,
  Gamepad2,
  Music,
  Youtube,
  Guitar,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useState } from "react"

interface DesktopNavigationProps {
  pathname: string
  children: ReactNode
}

interface NavGroup {
  label: string
  icon: React.ElementType
  href?: string
  children?: { href: string; label: string; icon: React.ElementType }[]
}

const navGroups: NavGroup[] = [
  { href: "/", icon: Home, label: "Home" },
  {
    label: "Practice",
    icon: Mic,
    children: [
      { href: "/record/live", label: "Free Practice", icon: Mic },
      { href: "/train", label: "Warmup", icon: Flame },
      { href: "/train/game", label: "Games", icon: Gamepad2 },
    ],
  },
  {
    label: "Learn",
    icon: GraduationCap,
    children: [
      { href: "/train/exercises", label: "Exercises", icon: Music },
      { href: "/record/karaoke", label: "Karaoke", icon: Youtube },
    ],
  },
  { href: "/guitar", icon: Guitar, label: "Guitar" },
  { href: "/edit/studio", icon: Layers, label: "Studio" },
  { href: "/library", icon: Library, label: "Library" },
]

export function DesktopNavigation({ pathname, children }: DesktopNavigationProps) {
  const {
    isRecording,
    pitchHistory,
    recordingDuration,
    error,
    saveAudioToSession,
  } = useAudioRecorderContext()

  const { saveSession } = useSessionLibrary()
  const recordingStartTimeRef = useRef<number | null>(null)
  const wasRecordingRef = useRef(false)

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Practice", "Learn"]))

  // Auto-save session when recording stops
  useEffect(() => {
    if (isRecording && !wasRecordingRef.current) {
      recordingStartTimeRef.current = Date.now()
    }

    if (!isRecording && wasRecordingRef.current && pitchHistory.length > 0) {
      const timer = setTimeout(async () => {
        const duration = recordingStartTimeRef.current
          ? Math.floor((Date.now() - recordingStartTimeRef.current) / 1000)
          : recordingDuration

        const sessionType = pathname.startsWith("/training") ? "training" : "live"
        const sessionId = saveSession(pitchHistory, sessionType, duration, undefined, true)

        if (sessionId) {
          const saved = await saveAudioToSession(sessionId)
          if (!saved) {
            console.warn("Audio not saved for session:", sessionId)
          }
        }

        recordingStartTimeRef.current = null
      }, 300)

      return () => clearTimeout(timer)
    }

    wasRecordingRef.current = isRecording
  }, [isRecording, pitchHistory, saveSession, pathname, recordingDuration, saveAudioToSession])

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/"
    return pathname.startsWith(path)
  }

  const isGroupActive = (group: NavGroup) => {
    if (group.href) return isActive(group.href)
    return group.children?.some(child => isActive(child.href)) ?? false
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  return (
    <div className="h-screen w-full flex bg-background">
      {/* Left Sidebar - 220px with labels */}
      <aside className="w-[220px] h-full bg-sidebar border-r border-border/50 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <Music2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">Vocal Coach</h1>
              {isRecording && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-xs text-destructive">Recording</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navGroups.map((group) => {
            const Icon = group.icon
            const active = isGroupActive(group)
            const expanded = expandedGroups.has(group.label)

            if (group.href) {
              return (
                <Link
                  key={group.label}
                  href={group.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                  <span className="font-medium">{group.label}</span>
                </Link>
              )
            }

            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                  <span className="font-medium flex-1 text-left">{group.label}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && group.children && (
                  <div className="ml-4 mt-1 space-y-0.5">
                    {group.children.map((child) => {
                      const ChildIcon = child.icon
                      const childActive = isActive(child.href)
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                            childActive
                              ? "bg-accent/70 text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                          }`}
                        >
                          <ChildIcon className={`w-4 h-4 ${childActive ? "text-primary" : ""}`} />
                          <span>{child.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Settings at bottom */}
        <div className="p-3 border-t border-border/50">
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
              isActive("/settings")
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            <Settings className={`w-5 h-5 ${isActive("/settings") ? "text-primary" : ""}`} />
            <span className="font-medium">Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Error Alert */}
        {error && (
          <div className="px-6 py-3 border-b border-border/50">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
