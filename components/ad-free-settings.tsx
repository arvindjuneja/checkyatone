"use client"

/**
 * Karta „bez reklam" w ustawieniach. Widoczna tylko w buildzie natywnym —
 * web nie ma reklam, więc nie ma czego wyłączać.
 *
 * Zakup jest scaffoldem: przycisk jest nieaktywny do czasu podpięcia
 * StoreKit/Play Billing (wymaga kont deweloperskich właściciela). Stan
 * adFree i cała reszta przepływu już działają — po podpięciu wtyczki IAP
 * jedyna zmiana to wywołanie setAdFree(true) z werdyktu sklepu.
 */

import { useEffect, useState } from "react"
import { isAdFree, setAdFree } from "@/lib/monetization"
import { isNativeApp } from "@/lib/native"
import { Button } from "@/components/ui/button"
import { BadgeCheck, Megaphone } from "lucide-react"

export function AdFreeSettings() {
  const [native, setNative] = useState(false)
  const [adFree, setAdFreeState] = useState(false)

  useEffect(() => {
    setNative(isNativeApp())
    setAdFreeState(isAdFree())
    const sync = () => setAdFreeState(isAdFree())
    window.addEventListener("ad-free-changed", sync)
    return () => window.removeEventListener("ad-free-changed", sync)
  }, [])

  if (!native) return null

  return (
    <div className="bg-card rounded-xl p-6 border border-border space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          {adFree ? (
            <BadgeCheck className="w-5 h-5 text-pitch-perfect" />
          ) : (
            <Megaphone className="w-5 h-5 text-primary" />
          )}
        </div>
        <div>
          <h3 className="font-semibold">{adFree ? "Wersja bez reklam" : "Reklamy"}</h3>
          <p className="text-xs text-muted-foreground">
            {adFree
              ? "Dziękujemy za wsparcie! Reklamy są wyłączone."
              : "Cała aplikacja jest darmowa. Reklamy pojawiają się tylko poza ekranami ćwiczeń — nigdy podczas śpiewania."}
          </p>
        </div>
      </div>

      {!adFree && (
        <div className="flex items-center gap-2">
          <Button disabled size="sm" title="Dostępne po publikacji w sklepie">
            Wyłącz reklamy (wkrótce)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled
            title="Przywracanie zakupów dostępne po publikacji"
          >
            Przywróć zakup
          </Button>
        </div>
      )}

      {adFree && process.env.NODE_ENV === "development" && (
        <Button variant="ghost" size="sm" onClick={() => setAdFree(false)}>
          [dev] Włącz reklamy z powrotem
        </Button>
      )}
    </div>
  )
}
