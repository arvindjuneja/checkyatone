"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function SingAlongRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/train/singalong")
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-pitch-perfect border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-muted-foreground">Przekierowywanie...</p>
      </div>
    </div>
  )
}
