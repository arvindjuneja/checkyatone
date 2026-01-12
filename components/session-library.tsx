"use client"

import { useState } from "react"
import { useSessionLibrary, type SessionMetadata, type Session } from "@/hooks/use-session-library"
import { Button } from "@/components/ui/button"
import { Trash2, Download, Edit2, Check, X, ArrowLeft } from "lucide-react"
import { PitchVisualizer } from "@/components/pitch-visualizer"

interface SessionLibraryProps {
  onClose?: () => void
}

export function SessionLibrary({ onClose }: SessionLibraryProps) {
  const { sessions, loading, loadSession, deleteSession, renameSession } = useSessionLibrary()
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [compareSession, setCompareSession] = useState<Session | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const handleLoadSession = (sessionId: string) => {
    const session = loadSession(sessionId)
    if (session) {
      setSelectedSession(session)
    }
  }

  const handleCompare = (sessionId: string) => {
    const session = loadSession(sessionId)
    if (session) {
      if (!selectedSession) {
        setSelectedSession(session)
      } else {
        setCompareSession(session)
      }
    }
  }

  const handleDelete = (sessionId: string) => {
    if (confirm("Czy na pewno chcesz usunąć tę sesję?")) {
      deleteSession(sessionId)
      if (selectedSession?.id === sessionId) {
        setSelectedSession(null)
      }
      if (compareSession?.id === sessionId) {
        setCompareSession(null)
      }
    }
  }

  const startEdit = (session: SessionMetadata) => {
    setEditingId(session.id)
    setEditName(session.name)
  }

  const saveEdit = (sessionId: string) => {
    if (editName.trim()) {
      renameSession(sessionId, editName.trim())
    }
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Ładowanie sesji...</p>
      </div>
    )
  }

  // Detail/Compare view
  if (selectedSession) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => {
            setSelectedSession(null)
            setCompareSession(null)
          }} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Powrót do listy
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Zamknij
            </Button>
          )}
        </div>

        {/* Selected Session */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-4">
          <div>
            <h3 className="text-lg font-bold">{selectedSession.name}</h3>
            <p className="text-sm text-muted-foreground">
              {selectedSession.date.toLocaleDateString("pl-PL")} • {selectedSession.duration}s • {selectedSession.noteCount} nut
              {selectedSession.averageAccuracy && ` • Trafność: ${selectedSession.averageAccuracy}%`}
            </p>
          </div>
          <div className="bg-background rounded-lg p-3">
            <PitchVisualizer
              pitchHistory={selectedSession.pitchHistory}
              currentPitch={null}
              isRecording={false}
            />
          </div>
        </div>

        {/* Compare Session */}
        {compareSession && (
          <div className="bg-card rounded-xl p-4 border border-pitch-good space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{compareSession.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {compareSession.date.toLocaleDateString("pl-PL")} • {compareSession.duration}s • {compareSession.noteCount} nut
                  {compareSession.averageAccuracy && ` • Trafność: ${compareSession.averageAccuracy}%`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCompareSession(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="bg-background rounded-lg p-3">
              <PitchVisualizer
                pitchHistory={compareSession.pitchHistory}
                currentPitch={null}
                isRecording={false}
              />
            </div>
          </div>
        )}

        {/* Comparison Stats */}
        {compareSession && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h4 className="font-semibold mb-3">Porównanie</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1">Trafność</div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{selectedSession.averageAccuracy}%</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-bold">{compareSession.averageAccuracy}%</span>
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Liczba nut</div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{selectedSession.noteCount}</span>
                  <span className="text-xs text-muted-foreground">vs</span>
                  <span className="font-bold">{compareSession.noteCount}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Select session to compare */}
        {!compareSession && sessions.filter(s => s.id !== selectedSession.id).length > 0 && (
          <div className="bg-card rounded-xl p-4 border border-border">
            <h4 className="font-semibold mb-3">Wybierz sesję do porównania</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {sessions
                .filter(s => s.id !== selectedSession.id)
                .slice(0, 10)
                .map((session) => (
                  <button
                    key={session.id}
                    onClick={() => handleCompare(session.id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-accent text-left transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium">{session.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {session.date.toLocaleDateString("pl-PL")} • {session.averageAccuracy}%
                      </div>
                    </div>
                    <Download className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Biblioteka sesji</h2>
          <p className="text-sm text-muted-foreground">
            {sessions.length} {sessions.length === 1 ? "zapisana sesja" : "zapisanych sesji"}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Zamknij
          </Button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="bg-card rounded-xl p-8 border border-border text-center">
          <p className="text-muted-foreground">
            Nie masz jeszcze zapisanych sesji. Nagrania automatycznie zapisują się po zakończeniu.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="bg-card rounded-xl p-4 border border-border hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {editingId === session.id ? (
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(session.id)
                          if (e.key === "Escape") cancelEdit()
                        }}
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => saveEdit(session.id)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={cancelEdit}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <h3 className="font-semibold truncate mb-1">{session.name}</h3>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{session.date.toLocaleDateString("pl-PL")}</span>
                    <span>•</span>
                    <span>{Math.floor(session.duration / 60)}:{String(session.duration % 60).padStart(2, "0")}</span>
                    <span>•</span>
                    <span>{session.noteCount} nut</span>
                    {session.averageAccuracy && (
                      <>
                        <span>•</span>
                        <span className="text-pitch-perfect font-semibold">
                          {session.averageAccuracy}% trafności
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => startEdit(session)}
                    title="Zmień nazwę"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleLoadSession(session.id)}
                    title="Zobacz szczegóły"
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => handleDelete(session.id)}
                    title="Usuń"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
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
