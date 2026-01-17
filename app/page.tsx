"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { Button } from "@/components/ui/button"
import { Radio, BookOpen, Music, ChevronRight, TrendingUp, Calendar, Target, Play, BarChart3, Layers } from "lucide-react"

export default function DashboardPage() {
  const router = useRouter()
  const { sessions } = useSessionLibrary()

  useEffect(() => {
    document.title = "Vocal Coach"
    trackPageView("Vocal Coach - Dashboard", "/")
  }, [])

  // Get today's sessions
  const todaySessions = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return sessions.filter(session => {
      const sessionDate = new Date(session.date)
      sessionDate.setHours(0, 0, 0, 0)
      return sessionDate.getTime() === today.getTime()
    })
  }, [sessions])

  // Get recent sessions (last 5)
  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
  }, [sessions])

  // Calculate today's stats
  const todayStats = useMemo(() => {
    const sessionCount = todaySessions.length
    const totalDuration = todaySessions.reduce((acc, s) => acc + (s.duration || 0), 0)
    const avgAccuracy = todaySessions.length > 0
      ? Math.round(todaySessions.reduce((acc, s) => acc + (s.averageAccuracy || 0), 0) / todaySessions.length)
      : 0

    return { sessionCount, totalDuration, avgAccuracy }
  }, [todaySessions])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    return `${mins}min`
  }

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case "live": return "Na zywo"
      case "training": return "Trening"
      case "analysis": return "Analiza"
      default: return mode
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Quick Start */}
      <div className="bg-card rounded-xl p-4 border border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Szybki start
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => router.push("/record/live")}
            className="group bg-pitch-perfect/10 hover:bg-pitch-perfect/20 transition-colors rounded-xl p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-pitch-perfect/20 flex items-center justify-center group-hover:bg-pitch-perfect/30 transition-colors">
                <Radio className="w-5 h-5 text-pitch-perfect" />
              </div>
              <div>
                <h3 className="font-semibold">Nagrywaj</h3>
                <p className="text-xs text-muted-foreground">Na zywo</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push("/train/exercises")}
            className="group bg-blue-500/10 hover:bg-blue-500/20 transition-colors rounded-xl p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                <BookOpen className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold">Cwicz</h3>
                <p className="text-xs text-muted-foreground">Cwiczenia</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push("/record/karaoke")}
            className="group bg-violet-500/10 hover:bg-violet-500/20 transition-colors rounded-xl p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                <Music className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <h3 className="font-semibold">Karaoke</h3>
                <p className="text-xs text-muted-foreground">Z YouTube</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push("/edit/projects")}
            className="group bg-amber-500/10 hover:bg-amber-500/20 transition-colors rounded-xl p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                <Layers className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-semibold">Multi-track</h3>
                <p className="text-xs text-muted-foreground">Edytor DAW</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Today's Progress */}
      <div className="bg-card rounded-xl p-4 border border-border">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Dzisiejsze postepy
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Calendar className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold">{todayStats.sessionCount}</p>
            <p className="text-xs text-muted-foreground">Sesji</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Target className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold text-pitch-perfect">
              {todayStats.avgAccuracy > 0 ? `${todayStats.avgAccuracy}%` : "-"}
            </p>
            <p className="text-xs text-muted-foreground">Dokladnosc</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className="text-2xl font-bold">
              {todayStats.totalDuration > 0 ? formatDuration(todayStats.totalDuration) : "-"}
            </p>
            <p className="text-xs text-muted-foreground">Czas</p>
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="bg-card rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Ostatnie sesje
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/library")}
            className="gap-1 text-xs"
          >
            Zobacz wszystkie
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>

        {recentSessions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">Brak sesji</p>
            <Button onClick={() => router.push("/record/live")} className="gap-2">
              <Radio className="w-4 h-4" />
              Nagraj pierwsza sesje
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/library/session?id=${session.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{session.name}</h3>
                    {session.averageAccuracy !== undefined && session.averageAccuracy > 0 && (
                      <span className="text-xs text-pitch-perfect bg-pitch-perfect/10 px-2 py-0.5 rounded">
                        {session.averageAccuracy}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {getModeLabel(session.mode)} • {formatDate(session.date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {session.hasAudio && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/edit/studio?session=${session.id}`)
                      }}
                      className="gap-1"
                    >
                      <Play className="w-3 h-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/library/session?id=${session.id}`)
                    }}
                    className="gap-1"
                  >
                    <BarChart3 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
