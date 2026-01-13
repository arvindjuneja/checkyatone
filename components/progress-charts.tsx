"use client"

import { useMemo } from "react"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { type SessionMetadata } from "@/hooks/use-session-library"

interface ProgressChartsProps {
  sessions: SessionMetadata[]
}

export function ProgressCharts({ sessions }: ProgressChartsProps) {
  // Prepare data for charts
  const chartData = useMemo(() => {
    if (sessions.length === 0) return { accuracyData: [], practiceData: [], modeData: [] }

    // Sort sessions by date
    const sortedSessions = [...sessions].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Accuracy over time
    const accuracyData = sortedSessions.map((session, index) => ({
      session: `#${index + 1}`,
      date: new Date(session.date).toLocaleDateString("pl-PL", { month: "short", day: "numeric" }),
      accuracy: session.averageAccuracy || 0,
    }))

    // Practice time by day
    const practiceByDay: { [key: string]: number } = {}
    sortedSessions.forEach(session => {
      const dateKey = new Date(session.date).toLocaleDateString("pl-PL", { month: "short", day: "numeric" })
      practiceByDay[dateKey] = (practiceByDay[dateKey] || 0) + (session.duration || 0)
    })

    const practiceData = Object.entries(practiceByDay).map(([date, duration]) => ({
      date,
      minutes: Math.round(duration / 60),
    }))

    // Sessions by mode
    const modeCount: { [key: string]: number } = {}
    sortedSessions.forEach(session => {
      const mode = session.mode === "live" ? "Na żywo" : session.mode === "training" ? "Trenuj" : "Analiza"
      modeCount[mode] = (modeCount[mode] || 0) + 1
    })

    const modeData = Object.entries(modeCount).map(([mode, count]) => ({
      mode,
      count,
    }))

    return { accuracyData, practiceData, modeData }
  }, [sessions])

  if (sessions.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6 border border-border text-center">
        <p className="text-muted-foreground">
          Brak danych do wyświetlenia. Rozpocznij ćwiczenia aby zobaczyć swoje postępy!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Accuracy Over Time */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h3 className="font-semibold mb-4">Dokładność w czasie</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData.accuracyData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke="hsl(var(--pitch-perfect))"
              strokeWidth={2}
              dot={{ fill: "hsl(var(--pitch-perfect))", r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Śledź jak poprawia się Twoja precyzja wokalnanad czasem
        </p>
      </div>

      {/* Practice Time */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h3 className="font-semibold mb-4">Czas ćwiczeń (minuty)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData.practiceData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Bar
              dataKey="minutes"
              fill="hsl(var(--pitch-good))"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Regularność jest kluczem do sukcesu!
        </p>
      </div>

      {/* Mode Distribution */}
      <div className="bg-card rounded-xl p-6 border border-border">
        <h3 className="font-semibold mb-4">Sesje według trybu</h3>
        <div className="space-y-3">
          {chartData.modeData.map(({ mode, count }) => {
            const total = chartData.modeData.reduce((acc, d) => acc + d.count, 0)
            const percentage = Math.round((count / total) * 100)

            return (
              <div key={mode}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{mode}</span>
                  <span className="text-muted-foreground">
                    {count} ({percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-pitch-perfect transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Achievements */}
      <div className="bg-gradient-to-br from-pitch-perfect/10 to-pitch-good/10 rounded-xl p-6 border border-pitch-perfect/20">
        <h3 className="font-semibold mb-3">🏆 Osiągnięcia</h3>
        <div className="space-y-2">
          {sessions.length >= 10 && (
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎯</span>
              <div>
                <p className="font-medium text-sm">Wytrwały</p>
                <p className="text-xs text-muted-foreground">Ukończono 10 sesji!</p>
              </div>
            </div>
          )}
          {sessions.length >= 50 && (
            <div className="flex items-center gap-3">
              <span className="text-2xl">⭐</span>
              <div>
                <p className="font-medium text-sm">Dedykowany</p>
                <p className="text-xs text-muted-foreground">Ukończono 50 sesji!</p>
              </div>
            </div>
          )}
          {sessions.some(s => (s.averageAccuracy || 0) >= 90) && (
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎵</span>
              <div>
                <p className="font-medium text-sm">Perfekcjonista</p>
                <p className="text-xs text-muted-foreground">Osiągnięto 90% dokładności!</p>
              </div>
            </div>
          )}
          {sessions.length < 10 && (
            <p className="text-sm text-muted-foreground italic">
              Ćwicz regularnie aby odblokować osiągnięcia!
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
