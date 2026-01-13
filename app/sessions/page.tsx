"use client"

import { useEffect } from "react"
import { trackPageView } from "@/lib/analytics"
import { SessionLibrary } from "@/components/session-library"

export default function SessionsPage() {
  useEffect(() => {
    document.title = "Vocal Coach - Sesje"
    trackPageView("Vocal Coach - Sesje", "/sessions")
  }, [])

  return (
    <div className="max-w-5xl mx-auto">
      <SessionLibrary />
    </div>
  )
}
