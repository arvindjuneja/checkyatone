"use client"

/**
 * Jedyny właściciel banera reklamowego. Obserwuje trasę i pokazuje banner
 * WYŁĄCZNIE na trasach z listy pozytywnej (lib/monetization.ts) — zmiana trasy
 * na treningową natychmiast go chowa. Na webie i przy aktywnym "bez reklam"
 * niczego nie renderuje ani nie ładuje.
 */

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { adsAllowedOn, hideBanner, isAdFree, showBanner } from "@/lib/monetization"
import { isNativeApp } from "@/lib/native"

export function AdGate() {
  const pathname = usePathname()

  useEffect(() => {
    if (!isNativeApp()) return

    const sync = () => {
      if (!isAdFree() && adsAllowedOn(pathname ?? "")) void showBanner()
      else void hideBanner()
    }

    sync()
    window.addEventListener("ad-free-changed", sync)
    return () => {
      window.removeEventListener("ad-free-changed", sync)
      void hideBanner()
    }
  }, [pathname])

  return null
}
