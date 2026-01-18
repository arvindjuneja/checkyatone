"use client"

import { useState, useEffect, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { MobileNavigation } from "@/components/mobile-navigation"
import { DesktopNavigation } from "@/components/desktop-navigation"
import { useAudioRecorderContext } from "@/contexts/audio-recorder-context"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function Template({ children }: { children: ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false)
  const { error } = useAudioRecorderContext()
  const pathname = usePathname()

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }

    checkScreenSize()
    window.addEventListener("resize", checkScreenSize)

    return () => window.removeEventListener("resize", checkScreenSize)
  }, [])

  if (isDesktop) {
    return <DesktopNavigation pathname={pathname}>{children}</DesktopNavigation>
  }

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <MobileNavigation pathname={pathname} />

      {/* Error Alert */}
      {error && (
        <div className="px-4 py-2 max-w-lg mx-auto w-full">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main Content - with bottom padding for floating nav */}
      <div className="flex-1 px-4 py-4 pb-24 max-w-lg mx-auto w-full">
        {children}
      </div>
    </main>
  )
}
