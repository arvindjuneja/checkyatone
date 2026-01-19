"use client"

import Link from "next/link"
import { Home, Mic, GraduationCap, Library, Music2, Settings, Guitar, TrendingUp } from "lucide-react"

interface MobileNavigationProps {
  pathname: string
}

export function MobileNavigation({ pathname }: MobileNavigationProps) {
  const isActive = (path: string) => {
    if (path === "/") return pathname === "/"
    return pathname.startsWith(path)
  }

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/record/live", icon: Mic, label: "Practice" },
    { href: "/train", icon: GraduationCap, label: "Learn" },
    { href: "/guitar", icon: Guitar, label: "Guitar" },
    { href: "/library/progress", icon: TrendingUp, label: "Progress" },
  ]

  return (
    <>
      {/* Top Header - Compact */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <Music2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-base text-foreground">Vocal Coach</h1>
              <p className="text-xs text-muted-foreground">Your daily voice studio</p>
            </div>
          </div>
          <Link
            href="/settings"
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
              isActive("/settings")
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* Floating Pill Navigation - Bottom */}
      <nav className="fixed bottom-4 left-4 right-4 z-50">
        <div className="mx-auto max-w-md bg-card/90 backdrop-blur-xl rounded-full border border-border/50 shadow-[0_8px_32px_-8px] shadow-black/50 p-1.5 flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded-full transition-all duration-200 ${
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
