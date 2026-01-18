"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { trackPageView } from "@/lib/analytics"
import { useSessionLibrary } from "@/hooks/use-session-library"
import { Button } from "@/components/ui/button"
import { Mic, GraduationCap, Gamepad2, ChevronRight, Play, Flame, Layers } from "lucide-react"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function getStreakDays(sessions: Array<{ date: string | Date }>): number {
  if (sessions.length === 0) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const sortedDates = [...new Set(
    sessions.map(s => {
      const d = new Date(s.date)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    })
  )].sort((a, b) => b - a)

  let streak = 0
  let currentDate = today.getTime()

  // Check if practiced today or yesterday
  if (sortedDates[0] !== currentDate) {
    const yesterday = currentDate - 86400000
    if (sortedDates[0] !== yesterday) return 0
    currentDate = yesterday
  }

  for (const dateTime of sortedDates) {
    if (dateTime === currentDate) {
      streak++
      currentDate -= 86400000
    } else if (dateTime < currentDate) {
      break
    }
  }

  return streak
}

function getWeekActivity(sessions: Array<{ date: string | Date }>): boolean[] {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  const week: boolean[] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    day.setHours(0, 0, 0, 0)

    const hasSession = sessions.some(s => {
      const sessionDate = new Date(s.date)
      sessionDate.setHours(0, 0, 0, 0)
      return sessionDate.getTime() === day.getTime()
    })
    week.push(hasSession)
  }

  return week
}

export default function HomePage() {
  const router = useRouter()
  const { sessions } = useSessionLibrary()

  useEffect(() => {
    document.title = "Vocal Coach"
    trackPageView("Vocal Coach - Home", "/")
  }, [])

  const greeting = getGreeting()
  const streakDays = useMemo(() => getStreakDays(sessions), [sessions])
  const weekActivity = useMemo(() => getWeekActivity(sessions), [sessions])

  // Get today's practice time
  const todayPracticeTime = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return sessions
      .filter(session => {
        const sessionDate = new Date(session.date)
        sessionDate.setHours(0, 0, 0, 0)
        return sessionDate.getTime() === today.getTime()
      })
      .reduce((acc, s) => acc + (s.duration || 0), 0)
  }, [sessions])

  const practiceMinutes = Math.floor(todayPracticeTime / 60)
  const dailyGoal = 5 // 5 minutes daily goal
  const progressPercent = Math.min(100, (practiceMinutes / dailyGoal) * 100)

  // Recent sessions (last 3)
  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
  }, [sessions])

  const formatTimeAgo = (date: string | Date) => {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now.getTime() - then.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) return "Just now"
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return "Yesterday"
    if (diffDays < 7) return `${diffDays} days ago`
    return then.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    return `${mins} min`
  }

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24">
      {/* Greeting & Streak */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{greeting}, singer!</h1>
        <div className="flex items-center gap-4">
          {streakDays > 0 && (
            <div className="flex items-center gap-1.5 text-accent-gold">
              <Flame className="w-5 h-5" />
              <span className="font-semibold">Day {streakDays} streak</span>
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="tabular-nums">{practiceMinutes}/{dailyGoal} min today</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Warmup Button */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-[0_4px_16px_-8px] shadow-black/20 p-6">
        <Button
          onClick={() => router.push("/train")}
          size="xl"
          className="w-full"
        >
          Ready to sing
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-3">5-min vocal warmup</p>
      </div>

      {/* Quick Access */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => router.push("/record/live")}
          className="group rounded-2xl border border-border/50 bg-card hover:bg-accent hover:border-border p-4 text-center transition-all duration-200"
        >
          <div className="w-11 h-11 mx-auto rounded-xl bg-secondary flex items-center justify-center group-hover:bg-primary/20 transition-colors mb-2">
            <Mic className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <h3 className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">Record</h3>
        </button>

        <button
          onClick={() => router.push("/train/exercises")}
          className="group rounded-2xl border border-border/50 bg-card hover:bg-accent hover:border-border p-4 text-center transition-all duration-200"
        >
          <div className="w-11 h-11 mx-auto rounded-xl bg-secondary flex items-center justify-center group-hover:bg-primary/20 transition-colors mb-2">
            <GraduationCap className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <h3 className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">Train</h3>
        </button>

        <button
          onClick={() => router.push("/train/game")}
          className="group rounded-2xl border border-border/50 bg-card hover:bg-accent hover:border-border p-4 text-center transition-all duration-200"
        >
          <div className="w-11 h-11 mx-auto rounded-xl bg-secondary flex items-center justify-center group-hover:bg-primary/20 transition-colors mb-2">
            <Gamepad2 className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <h3 className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">Game</h3>
        </button>

        <button
          onClick={() => router.push("/edit/studio")}
          className="group rounded-2xl border border-border/50 bg-card hover:bg-accent hover:border-border p-4 text-center transition-all duration-200"
        >
          <div className="w-11 h-11 mx-auto rounded-xl bg-secondary flex items-center justify-center group-hover:bg-primary/20 transition-colors mb-2">
            <Layers className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <h3 className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">Studio</h3>
        </button>
      </div>

      {/* This Week */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-[0_4px_16px_-8px] shadow-black/20 p-5">
        <h2 className="text-sm font-semibold text-muted-foreground mb-4">This Week</h2>
        <div className="flex items-center justify-between">
          {weekDays.map((day, idx) => (
            <div key={day} className="flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground">{day}</span>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  weekActivity[idx]
                    ? "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {weekActivity[idx] ? (
                  <div className="w-3 h-3 rounded-full bg-primary" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-[0_4px_16px_-8px] shadow-black/20 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent Sessions</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/library")}
            className="gap-1 text-xs rounded-xl"
          >
            View all
            <ChevronRight className="w-3 h-3" />
          </Button>
        </div>

        {recentSessions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">Your journey starts here</p>
            <Button onClick={() => router.push("/record/live")} className="gap-2">
              <Mic className="w-4 h-4" />
              Start your first session
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <div
                key={session.id}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-accent/30 transition-all duration-200 text-left cursor-pointer"
                onClick={() => router.push(`/library/session?id=${session.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{session.name}</h3>
                    {session.averageAccuracy !== undefined && session.averageAccuracy > 0 && (
                      <span className="text-xs text-pitch-perfect bg-pitch-perfect/10 px-2 py-0.5 rounded-full">
                        {session.averageAccuracy}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatTimeAgo(session.date)} {session.duration ? `• ${formatDuration(session.duration)}` : ""}
                  </p>
                </div>
                {session.hasAudio && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/edit/studio?session=${session.id}`)
                    }}
                    className="rounded-xl"
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
