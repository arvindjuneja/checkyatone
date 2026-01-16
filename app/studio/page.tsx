"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"

function StudioRedirectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Preserve query parameters when redirecting
    const params = searchParams.toString()
    router.replace(`/edit/studio${params ? `?${params}` : ""}`)
  }, [router, searchParams])

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-pitch-perfect border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-muted-foreground">Przekierowywanie...</p>
      </div>
    </div>
  )
}

export default function StudioRedirect() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin w-8 h-8 border-4 border-pitch-perfect border-t-transparent rounded-full" /></div>}>
      <StudioRedirectContent />
    </Suspense>
  )
}
