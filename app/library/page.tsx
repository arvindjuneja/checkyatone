"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { Button } from "@/components/ui/button"
import { Library, Play, Trash2, BarChart3, TrendingUp, Filter, Radio, Music, BookOpen } from "lucide-react"

type FilterMode = "all" | "live" | "training" | "karaoke"

export default function LibraryPage() {
  const router = useRouter()
  const { sessions, deleteSession, clearAllSessions } = useSessionLibrary()
  const [filterMode, setFilterMode] = useState<FilterMode>("all")

  useEffect(() => {
    document.title = "Vocal Coach - Biblioteka"
    trackPageView("Vocal Coach - Biblioteka", "/library")
  }, [])

  const filteredSessions = useMemo(() => {
    if (filterMode === "all") return sessions

    return sessions.filter(session => {
      switch (filterMode) {
        case "live":
          return session.mode === "live"
        case "training":
          return session.mode === "training"
        case "karaoke":
          // karaoke is currently stored as "analysis" mode
          return session.mode === "analysis"
        default:
          return true
      }
    })
  }, [sessions, filterMode])

  const handleFilterChange = (mode: FilterMode) => {
    setFilterMode(mode)
    trackEvent("library_filter_changed", "Library", mode)
  }

  const handleDeleteSession = (id: string, name: string) => {
    if (confirm(`Czy na pewno chcesz usunac sesje "${name}"?`)) {
      deleteSession(id)
      trackEvent("session_deleted", "Library")
    }
  }

  const handleClearAll = () => {
    if (confirm("Czy na pewno chcesz usunac wszystkie sesje? Tej operacji nie mozna cofnac.")) {
      clearAllSessions()
      trackEvent("all_sessions_cleared", "Library")
    }
  }

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case "live":
        return <Radio className="w-4 h-4 text-pitch-perfect" />
      case "training":
        return <BookOpen className="w-4 h-4 text-blue-500" />
      case "analysis":
        return <Music className="w-4 h-4 text-violet-500" />
      default:
        return <Radio className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case "live":
        return "Na zywo"
      case "training":
        return "Trening"
      case "analysis":
        return "Analiza"
      default:
        return mode
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="w-6 h-6 text-pitch-perfect" />
            Biblioteka
          </h1>
          <p className="text-sm text-muted-foreground">
            {filteredSessions.length} z {sessions.length} sesji
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/library/progress")}
            className="gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            Postepy
          </Button>
          {sessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Wyczysc</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-1">
        <Filter className="w-4 h-4 ml-2 text-muted-foreground" />
        {(["all", "live", "training", "karaoke"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => handleFilterChange(mode)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              filterMode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode === "all" && "Wszystkie"}
            {mode === "live" && "Na zywo"}
            {mode === "training" && "Trening"}
            {mode === "karaoke" && "Karaoke"}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredSessions.length === 0 && (
        <div className="bg-card rounded-xl p-8 border border-border text-center space-y-4">
          <Library className="w-12 h-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-semibold mb-1">Brak sesji</h3>
            <p className="text-sm text-muted-foreground">
              {filterMode === "all"
                ? "Zacznij nagrywac, aby widziec swoje sesje tutaj"
                : "Brak sesji dla wybranego filtra"}
            </p>
          </div>
          <Button onClick={() => router.push("/record/live")} className="gap-2">
            <Radio className="w-4 h-4" />
            Nagraj sesje
          </Button>
        </div>
      )}

      {/* Sessions list */}
      {filteredSessions.length > 0 && (
        <div className="space-y-3">
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              className="bg-card rounded-xl p-4 border border-border hover:border-pitch-perfect/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  {getModeIcon(session.mode)}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{session.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{getModeLabel(session.mode)}</span>
                      <span>•</span>
                      <span>{formatDate(session.date)}</span>
                      {session.duration && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(session.duration)}</span>
                        </>
                      )}
                      {session.averageAccuracy !== undefined && session.averageAccuracy > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-pitch-perfect">{session.averageAccuracy}% dokladnosci</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/library/session?id=${session.id}`)}
                    className="gap-2"
                  >
                    <BarChart3 className="w-3 h-3" />
                    Szczegoly
                  </Button>
                  {session.hasAudio && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/edit/studio?session=${session.id}`)}
                      className="gap-2"
                    >
                      <Play className="w-3 h-3" />
                      Studio
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteSession(session.id, session.name)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
