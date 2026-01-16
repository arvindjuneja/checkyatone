"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { useSessionLibrary, type Session } from "@/hooks/use-session-library"
import { Button } from "@/components/ui/button"
import { TimelineAnalysis } from "@/components/timeline-analysis"
import { ArrowLeft, Play, Download, Trash2, BarChart3 } from "lucide-react"
import { getSessionAudio } from "@/lib/audio-storage"

function SessionDetailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { sessions, loadSession, deleteSession } = useSessionLibrary()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fullSession, setFullSession] = useState<Session | null>(null)

  const sessionId = searchParams.get("id")
  const sessionMeta = sessions.find(s => s.id === sessionId)

  useEffect(() => {
    if (sessionMeta && sessionId) {
      document.title = `Vocal Coach - ${sessionMeta.name}`
      trackPageView(`Session: ${sessionMeta.name}`, `/library/session?id=${sessionId}`)

      // Load full session with pitch history
      const loaded = loadSession(sessionId)
      setFullSession(loaded)

      // Load audio if available
      if (sessionMeta.hasAudio) {
        loadAudio(sessionId)
      } else {
        setIsLoading(false)
      }
    } else {
      setIsLoading(false)
    }
  }, [sessionMeta, sessionId, loadSession])

  const loadAudio = async (id: string) => {
    try {
      const blob = await getSessionAudio(id)
      if (blob) {
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
      }
    } catch (error) {
      console.error("Failed to load audio:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Use full session data if available, otherwise use metadata
  const session = fullSession || sessionMeta

  const handleDelete = () => {
    if (session && sessionId && confirm(`Czy na pewno chcesz usunac sesje "${session.name}"?`)) {
      deleteSession(sessionId)
      router.push("/library")
    }
  }

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement("a")
      a.href = audioUrl
      a.download = `${session?.name || "session"}.webm`
      a.click()
    }
  }

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "long",
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

  if (!session || !sessionId) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <button
          onClick={() => router.push("/library")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Powrot do biblioteki
        </button>
        <div className="bg-card rounded-xl p-8 border border-border text-center">
          <h2 className="text-xl font-bold mb-2">Sesja nie znaleziona</h2>
          <p className="text-muted-foreground">Ta sesja nie istnieje lub zostala usunieta.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/library")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Powrot do biblioteki
      </button>

      {/* Header */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{session.name}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span>{getModeLabel(session.mode)}</span>
              <span>•</span>
              <span>{formatDate(session.date)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session.hasAudio && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/edit/studio?session=${sessionId}`)}
                  className="gap-2"
                >
                  <Play className="w-4 h-4" />
                  Otworz w Studio
                </Button>
                {audioUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Pobierz
                  </Button>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              Usun
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">Czas trwania</p>
          <p className="text-2xl font-bold">{session.duration ? formatDuration(session.duration) : "-"}</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">Dokladnosc</p>
          <p className="text-2xl font-bold text-pitch-perfect">
            {session.averageAccuracy !== undefined && session.averageAccuracy > 0
              ? `${session.averageAccuracy}%`
              : "-"}
          </p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">Liczba nut</p>
          <p className="text-2xl font-bold">
            {session.noteCount > 0 ? session.noteCount : "-"}
          </p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <p className="text-xs text-muted-foreground mb-1">Audio</p>
          <p className="text-2xl font-bold">{session.hasAudio ? "Tak" : "Nie"}</p>
        </div>
      </div>

      {/* Audio Player */}
      {audioUrl && (
        <div className="bg-card rounded-xl p-4 border border-border">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Play className="w-4 h-4" />
            Odtwarzacz
          </h3>
          <audio src={audioUrl} controls className="w-full" />
        </div>
      )}

      {/* Pitch Analysis */}
      {fullSession?.pitchHistory && fullSession.pitchHistory.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Analiza intonacji
          </h3>
          <TimelineAnalysis pitchHistory={fullSession.pitchHistory} />

          {/* Tips */}
          <div className="bg-card rounded-xl p-4 border border-border space-y-3">
            <h3 className="font-semibold text-sm">Wskazowki</h3>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-pitch-perfect mt-1.5 shrink-0" />
                <span>
                  <strong className="text-pitch-perfect">Zielony</strong> - spiewasz idealnie w tonacji (±10 centow)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-pitch-good mt-1.5 shrink-0" />
                <span>
                  <strong className="text-pitch-good">Zoltozielony</strong> - jestes blisko, ale lekko odchylony (±25 centow)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-pitch-off mt-1.5 shrink-0" />
                <span>
                  <strong className="text-pitch-off">Czerwony</strong> - znaczace odchylenie od nuty ({">"}25 centow)
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="bg-card rounded-xl p-8 border border-border text-center">
          <div className="animate-spin w-8 h-8 border-4 border-pitch-perfect border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground">Ladowanie danych sesji...</p>
        </div>
      )}
    </div>
  )
}

export default function SessionDetailPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto p-8 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-pitch-perfect border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-muted-foreground">Ladowanie...</p>
      </div>
    }>
      <SessionDetailContent />
    </Suspense>
  )
}
