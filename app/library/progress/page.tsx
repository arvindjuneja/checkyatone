"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { getVocalRangeFromSessions } from "@/hooks/use-vocal-range"
import { VocalRangeDisplay } from "@/components/vocal-range-display"
import { ProgressCharts } from "@/components/progress-charts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { TrendingUp, Music2, Calendar, Trash2, Filter, ArrowLeft } from "lucide-react"

type TimePeriod = "today" | "week" | "month" | "3months" | "all"

export default function ProgressPage() {
  const router = useRouter()
  const { sessions, clearAllSessions } = useSessionLibrary()
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all")

  // Filter sessions by time period
  const filteredSessions = useMemo(() => {
    if (timePeriod === "all") return sessions

    const now = new Date()
    const startDate = new Date()

    switch (timePeriod) {
      case "today":
        startDate.setHours(0, 0, 0, 0)
        break
      case "week":
        startDate.setDate(now.getDate() - 7)
        break
      case "month":
        startDate.setMonth(now.getMonth() - 1)
        break
      case "3months":
        startDate.setMonth(now.getMonth() - 3)
        break
    }

    return sessions.filter(session => new Date(session.date) >= startDate)
  }, [sessions, timePeriod])

  const [vocalRange, setVocalRange] = useState(getVocalRangeFromSessions(filteredSessions))

  useEffect(() => {
    document.title = "Vocal Coach - Postepy"
    trackPageView("Vocal Coach - Postepy", "/library/progress")
  }, [])

  useEffect(() => {
    setVocalRange(getVocalRangeFromSessions(filteredSessions))
  }, [filteredSessions])

  // Calculate statistics
  const totalSessions = filteredSessions.length
  const totalDuration = filteredSessions.reduce((acc, s) => acc + (s.duration || 0), 0)
  const avgAccuracy = filteredSessions.length > 0
    ? Math.round(filteredSessions.reduce((acc, s) => acc + (s.averageAccuracy || 0), 0) / filteredSessions.length)
    : 0

  // Calculate practice streak (always use all sessions for streak)
  const calculateStreak = () => {
    if (sessions.length === 0) return 0

    const sortedSessions = [...sessions].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    let streak = 0
    let currentDate = new Date()
    currentDate.setHours(0, 0, 0, 0)

    for (const session of sortedSessions) {
      const sessionDate = new Date(session.date)
      sessionDate.setHours(0, 0, 0, 0)

      const diffDays = Math.floor((currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays === streak) {
        streak++
      } else if (diffDays > streak) {
        break
      }
    }

    return streak
  }

  const practiceStreak = calculateStreak()

  const handleTimePeriodChange = (period: TimePeriod) => {
    setTimePeriod(period)
    trackEvent("time_period_changed", "Progress", period)
  }

  const handleReset = () => {
    if (confirm("Czy na pewno chcesz usunac wszystkie sesje? Tej operacji nie mozna cofnac.")) {
      clearAllSessions()
      trackEvent("progress_reset", "Progress")
    }
  }

  const getTimePeriodLabel = (period: TimePeriod) => {
    switch (period) {
      case "today": return "Dzis"
      case "week": return "Tydzien"
      case "month": return "Miesiac"
      case "3months": return "3 miesiace"
      case "all": return "Wszystko"
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/library")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Powrot do biblioteki
      </button>

      {/* Header with Time Filter and Reset */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-pitch-perfect" />
            Postepy
          </h1>
          <p className="text-sm text-muted-foreground">
            {timePeriod === "all"
              ? `Wszystkie ${sessions.length} sesji`
              : `${filteredSessions.length} z ${sessions.length} sesji`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Period Filter */}
          <div className="flex items-center gap-2 bg-secondary/50 rounded-lg p-1">
            <Filter className="w-4 h-4 ml-2 text-muted-foreground" />
            {(["today", "week", "month", "3months", "all"] as TimePeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => handleTimePeriodChange(period)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  timePeriod === period
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {getTimePeriodLabel(period)}
              </button>
            ))}
          </div>

          {/* Reset Button */}
          {sessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Resetuj</span>
            </Button>
          )}
        </div>
      </div>

      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sesji</span>
          </div>
          <p className="text-2xl font-bold">{totalSessions}</p>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Music2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Czas cwiczen</span>
          </div>
          <p className="text-2xl font-bold">{Math.floor(totalDuration / 60)}min</p>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sr. dokladnosc</span>
          </div>
          <p className="text-2xl font-bold">{avgAccuracy}%</p>
        </div>

        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">&#128293;</span>
            <span className="text-xs text-muted-foreground">Passa</span>
          </div>
          <p className="text-2xl font-bold">{practiceStreak} {practiceStreak === 1 ? 'dzien' : 'dni'}</p>
        </div>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="range" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="range">Zakres wokalny</TabsTrigger>
          <TabsTrigger value="stats">Statystyki</TabsTrigger>
        </TabsList>

        <TabsContent value="range" className="space-y-4">
          <VocalRangeDisplay range={vocalRange} />
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <ProgressCharts sessions={filteredSessions} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
