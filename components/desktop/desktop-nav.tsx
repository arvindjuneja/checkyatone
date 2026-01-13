"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Music2, Mic, BookOpen, Gamepad2, Music, BarChart3, Library } from "lucide-react"
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

  const isTrainingActive = pathname.startsWith("/training")

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
          {isRecording ? "Stop (R)" : "Start (R)"}
        </Button>
        <Button
          onClick={onOpenLibrary}
          variant="outline"
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Library className="w-4 h-4" />
          Biblioteka sesji
        </Button>
      </div>

      {/* Navigation */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nawigacja</h3>
        <Link
          href="/"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isActive("/") && pathname === "/"
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Music2 className="w-4 h-4" />
          <span>Na żywo</span>
          <span className="ml-auto text-xs opacity-50">1</span>
        </Link>
        <Link
          href="/training"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isTrainingActive
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Trenuj</span>
          <span className="ml-auto text-xs opacity-50">2</span>
        </Link>
        <Link
          href="/analysis"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isActive("/analysis")
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analiza</span>
          <span className="ml-auto text-xs opacity-50">3</span>
        </Link>
        <Link
          href="/about"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            isActive("/about")
              ? "bg-pitch-perfect/20 text-pitch-perfect font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Music className="w-4 h-4" />
          <span>Po co?</span>
          <span className="ml-auto text-xs opacity-50">4</span>
        </Link>
      </div>

      {/* Training Modes (when on Training tab) */}
      {isTrainingActive && (
        <div className="space-y-2 pt-4 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tryb treningowy</h3>
          <Link
            href="/training/exercises"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === "/training/exercises"
                ? "bg-pitch-good/20 text-pitch-good font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Ćwiczenia</span>
          </Link>
          <Link
            href="/training/game"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === "/training/game"
                ? "bg-pitch-good/20 text-pitch-good font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>Hit the Note!</span>
          </Link>
          <Link
            href="/training/singalong"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              pathname === "/training/singalong"
                ? "bg-pitch-good/20 text-pitch-good font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Śpiewaj z piosenką</span>
          </Link>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-auto pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Naciśnij <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">?</kbd> aby zobaczyć wszystkie skróty
        </p>
      </div>
    </div>
  )
}
