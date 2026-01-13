"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Music, Mic, Square, Play, Pause, Download, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"

// YouTube Player types
declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

export default function KaraokePage() {
  const router = useRouter()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [videoId, setVideoId] = useState<string | null>(null)
  const [player, setPlayer] = useState<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const playerRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    document.title = "Vocal Coach - Karaoke"
    trackPageView("Vocal Coach - Karaoke", "/karaoke")
  }, [])

  // Load YouTube iframe API
  useEffect(() => {
    if (typeof window !== "undefined" && !window.YT) {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      const firstScriptTag = document.getElementsByTagName("script")[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

      window.onYouTubeIframeAPIReady = () => {
        console.log("[Karaoke] YouTube API ready")
      }
    }
  }, [])

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  const loadVideo = () => {
    const id = extractVideoId(youtubeUrl)
    if (!id) {
      setError("Nieprawidłowy URL YouTube. Użyj formatu: https://youtube.com/watch?v=...")
      return
    }

    setVideoId(id)
    setError(null)
    trackEvent("karaoke_video_loaded", "Karaoke", id)

    // Initialize player after a short delay to ensure API is loaded
    setTimeout(() => {
      if (window.YT && window.YT.Player) {
        const newPlayer = new window.YT.Player("youtube-player", {
          videoId: id,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
          },
          events: {
            onStateChange: (event: any) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true)
              } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
                setIsPlaying(false)
                if (isRecording) {
                  stopRecording()
                }
              }
            },
          },
        })
        playerRef.current = newPlayer
        setPlayer(newPlayer)
      }
    }, 500)
  }

  const startKaraoke = async () => {
    if (!player) return

    try {
      // Start recording
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        setRecordedBlob(blob)
        stream.getTracks().forEach(track => track.stop())
        console.log("[Karaoke] Recording saved, size:", blob.size)
        trackEvent("karaoke_recording_completed", "Karaoke", undefined, recordingDuration)
      }

      mediaRecorder.start(100)
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      setRecordingDuration(0)

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1)
      }, 1000)

      // Start YouTube video
      player.playVideo()

      trackEvent("karaoke_started", "Karaoke")
    } catch (err) {
      console.error("[Karaoke] Failed to start:", err)
      setError("Nie można uzyskać dostępu do mikrofonu. Sprawdź uprawnienia.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    setIsRecording(false)

    if (player) {
      player.pauseVideo()
    }
  }

  const downloadRecording = () => {
    if (!recordedBlob) return

    const url = URL.createObjectURL(recordedBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = `karaoke-vocals-${Date.now()}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    trackEvent("karaoke_download", "Karaoke")
  }

  const processInStudio = () => {
    if (!recordedBlob) return

    // Save to localStorage temporarily
    const reader = new FileReader()
    reader.onload = () => {
      localStorage.setItem("karaoke-temp-audio", reader.result as string)
      router.push("/studio?source=karaoke")
    }
    reader.readAsDataURL(recordedBlob)

    trackEvent("karaoke_to_studio", "Karaoke")
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Music className="w-6 h-6 text-pitch-perfect" />
          Karaoke Machine
        </h1>
        <p className="text-sm text-muted-foreground">
          Śpiewaj z YouTube, nagrywaj swój wokal, przetwarzaj w Studio
        </p>
      </div>

      {/* YouTube URL Input */}
      {!videoId && (
        <div className="bg-card rounded-xl p-6 border border-border space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Wklej link do YouTube</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Użyj podkładu karaoke, utworu instrumentalnego, lub dowolnego wideo z YouTube
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pitch-perfect"
              onKeyDown={(e) => e.key === "Enter" && loadVideo()}
            />
            <Button onClick={loadVideo} className="gap-2">
              <Play className="w-4 h-4" />
              Załaduj
            </Button>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              💡 <strong>Wskazówka:</strong> Szukaj "karaoke" lub "instrumental" na YouTube dla najlepszych wyników
            </p>
          </div>
        </div>
      )}

      {/* Video Player */}
      {videoId && (
        <>
          <div className="bg-card rounded-xl p-4 border border-border">
            <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
              <div id="youtube-player" className="w-full h-full" />
            </div>
          </div>

          {/* Recording Controls */}
          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Nagrywanie</h3>
                <p className="text-xs text-muted-foreground">
                  {!isRecording ? "Naciśnij Start aby rozpocząć nagrywanie wokalu" : "Nagrywanie w toku..."}
                </p>
              </div>
              {isRecording && (
                <div className="text-3xl font-mono font-bold text-pitch-perfect animate-pulse">
                  {formatTime(recordingDuration)}
                </div>
              )}
            </div>

            <div className="flex gap-3 flex-wrap">
              {!isRecording ? (
                <Button
                  onClick={startKaraoke}
                  size="lg"
                  className="gap-2 bg-pitch-perfect text-background hover:opacity-90"
                >
                  <Mic className="w-5 h-5" />
                  Start Karaoke
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  size="lg"
                  variant="destructive"
                  className="gap-2"
                >
                  <Square className="w-5 h-5" />
                  Stop nagrywania
                </Button>
              )}

              <Button
                onClick={() => {
                  setVideoId(null)
                  setYoutubeUrl("")
                  setRecordedBlob(null)
                  setIsRecording(false)
                  setIsPlaying(false)
                  if (player) {
                    player.destroy()
                    setPlayer(null)
                  }
                }}
                size="lg"
                variant="outline"
              >
                Zmień wideo
              </Button>
            </div>
          </div>

          {/* Recorded Vocals */}
          {recordedBlob && !isRecording && (
            <div className="bg-card rounded-xl p-6 border border-border space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  ✓ Nagranie gotowe!
                </h3>
                <p className="text-xs text-muted-foreground">
                  Twój wokal został nagrany. Możesz go pobrać lub przetworzyć w Studio.
                </p>
              </div>

              <div className="flex gap-3 flex-wrap">
                <Button
                  onClick={processInStudio}
                  size="lg"
                  className="gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  Przetwórz w Studio
                </Button>
                <Button
                  onClick={downloadRecording}
                  size="lg"
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="w-5 h-5" />
                  Pobierz surowy wokal
                </Button>
              </div>

              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  💡 <strong>Dalsze kroki:</strong> Przetwórz wokal w Studio, użyj presetów (Podcast Voice, Studio Vocals, etc.),
                  a następnie zmiksuj z oryginalnym podkładem w edytorze wideo/audio.
                </p>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-secondary/30 rounded-lg p-4 text-sm space-y-2">
            <p className="font-semibold">Jak to działa:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>1. Wideo YouTube odtwarza się jako podkład</li>
              <li>2. Mikrofon nagrywa TYLKO Twój wokal (bez audio z YouTube)</li>
              <li>3. Otrzymujesz czysty track wokalny do dalszej obróbki</li>
              <li>4. Możesz przetworzyć wokal w Studio z profesjonalnymi presetami</li>
              <li>5. Zmiksuj przetworzony wokal z podkładem w dowolnym edytorze</li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
