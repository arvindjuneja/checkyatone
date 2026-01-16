"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Home,
  Mic,
  Radio,
  Music,
  BookOpen,
  Gamepad2,
  Sparkles,
  Layers,
  Library,
  TrendingUp,
  Settings
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface DesktopNavProps {
  pathname: string
  isRecording: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onOpenLibrary: () => void
}

export function DesktopNav({
  pathname,
  isRecording,
  onStartRecording,
  onStopRecording,
  onOpenLibrary,
}: DesktopNavProps) {
  const router = useRouter()

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/"
    return pathname.startsWith(path)
  }

  const isRecordActive = pathname.startsWith("/record")
  const isTrainActive = pathname.startsWith("/train")
  const isEditActive = pathname.startsWith("/edit")
  const isLibraryActive = pathname.startsWith("/library")

  return (
    <div className="h-full flex flex-col p-4 space-y-6 overflow-y-auto">
      {/* Quick Actions */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Szybkie akcje</h3>
        <Button
          onClick={isRecording ? onStopRecording : onStartRecording}
          variant={isRecording ? "destructive" : "default"}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Mic className="w-4 h-4" />
          {isRecording ? "Stop (R)" : "Nagrywaj (R)"}
        </Button>
        <Button
          onClick={onOpenLibrary}
          variant="outline"
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Library className="w-4 h-4" />
          Biblioteka
        </Button>
      </div>

      {/* Dashboard */}
      <div className="space-y-2">
        <Link
          href="/"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isActive("/") && pathname === "/"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Start</span>
        </Link>
      </div>

      {/* Nagrywaj (Record) */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nagrywaj</h3>
        <Link
          href="/record/live"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/record/live"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Na zywo</span>
          <span className="ml-auto text-xs opacity-50">1</span>
        </Link>
        <Link
          href="/record/karaoke"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/record/karaoke"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Music className="w-4 h-4" />
          <span>Karaoke</span>
          <span className="ml-auto text-xs opacity-50">2</span>
        </Link>
      </div>

      {/* Trenuj (Train) */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Trenuj</h3>
        <Link
          href="/train/exercises"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/train/exercises"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Cwiczenia</span>
          <span className="ml-auto text-xs opacity-50">3</span>
        </Link>
        <Link
          href="/train/game"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/train/game"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Hit the Note!</span>
          <span className="ml-auto text-xs opacity-50">4</span>
        </Link>
        <Link
          href="/train/singalong"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/train/singalong"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Music className="w-4 h-4" />
          <span>Spiewaj z piosenka</span>
          <span className="ml-auto text-xs opacity-50">5</span>
        </Link>
      </div>

      {/* Edytuj (Edit) */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Edytuj</h3>
        <Link
          href="/edit/studio"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname.startsWith("/edit/studio")
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Studio</span>
          <span className="ml-auto text-xs opacity-50">6</span>
        </Link>
        <Link
          href="/edit/projects"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/edit/projects"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Multi-track</span>
          <span className="ml-auto text-xs opacity-50">7</span>
        </Link>
      </div>

      {/* Biblioteka (Library) */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Biblioteka</h3>
        <Link
          href="/library"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/library"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Library className="w-4 h-4" />
          <span>Wszystkie sesje</span>
          <span className="ml-auto text-xs opacity-50">8</span>
        </Link>
        <Link
          href="/library/progress"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/library/progress"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Postepy</span>
          <span className="ml-auto text-xs opacity-50">9</span>
        </Link>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-border space-y-2">
        <Link
          href="/settings"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname === "/settings"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Ustawienia</span>
          <span className="ml-auto text-xs opacity-50">0</span>
        </Link>
        <p className="text-xs text-muted-foreground px-3">
          Nacisnij <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">?</kbd> aby zobaczyc wszystkie skroty
        </p>
      </div>
    </div>
  )
}
