"use client"

import Link from "next/link"
import { Music2 } from "lucide-react"

interface MobileNavigationProps {
  pathname: string
}

export function MobileNavigation({ pathname }: MobileNavigationProps) {
  const isActive = (path: string) => {
    if (path === "/") return pathname === "/"
    return pathname.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-lg border-b border-border">
      <div className="max-w-lg mx-auto">
        {/* Logo and Title */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-pitch-perfect flex items-center justify-center shadow-sm">
              <Music2 className="w-5 h-5 text-background" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground">Vocal Coach</h1>
              <a
                href="https://instagram.com/arvindspiewa"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                @arvindspiewa
              </a>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-2 pb-2">
          <div className="flex bg-secondary/50 rounded-xl p-1 gap-1 overflow-x-auto">
            <Link
              href="/"
              className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all text-center whitespace-nowrap ${
                isActive("/") && pathname === "/"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Na żywo
            </Link>
            <Link
              href="/training"
              className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all text-center whitespace-nowrap ${
                isActive("/training")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Trenuj
            </Link>
            <Link
              href="/progress"
              className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all text-center whitespace-nowrap ${
                isActive("/progress")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Postępy
            </Link>
            <Link
              href="/analysis"
              className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all text-center whitespace-nowrap ${
                isActive("/analysis")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Analiza
            </Link>
            <Link
              href="/about"
              className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all text-center whitespace-nowrap ${
                isActive("/about")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Po co?
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
