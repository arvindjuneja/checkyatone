"use client"

import { useEffect } from "react"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { trackPageView } from "@/lib/analytics"
import { TimelineAnalysis } from "@/components/timeline-analysis"

export default function AnalysisPage() {
  const { pitchHistory } = useAudioRecorderContext()

  useEffect(() => {
    document.title = "Vocal Coach - Analiza"
    trackPageView("Vocal Coach - Analiza", "/analysis")
  }, [])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <TimelineAnalysis pitchHistory={pitchHistory} />

      {/* Tips */}
      <div className="bg-card rounded-xl p-4 border border-border space-y-3">
        <h3 className="font-semibold text-sm">Wskazówki</h3>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-pitch-perfect mt-1.5 shrink-0" />
            <span>
              <strong className="text-pitch-perfect">Zielony</strong> - śpiewasz idealnie w tonacji (±10 centów)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-pitch-good mt-1.5 shrink-0" />
            <span>
              <strong className="text-pitch-good">Żółtozielony</strong> - jesteś blisko, ale lekko odchylony (±25 centów)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full bg-pitch-off mt-1.5 shrink-0" />
            <span>
              <strong className="text-pitch-off">Czerwony</strong> - znaczące odchylenie od nuty ({">"}25 centów)
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
