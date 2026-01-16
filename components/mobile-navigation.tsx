"use client"

import Link from "next/link"
import { Home, Radio, BookOpen, Sparkles, Library, Music2 } from "lucide-react"

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

        {/* Tab Navigation - 5 tabs */}
        <div className="px-2 pb-2">
          <div className="flex bg-secondary/50 rounded-xl p-1 gap-1">
            <Link
              href="/"
              className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${
                isActive("/") && pathname === "/"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Start</span>
            </Link>
            <Link
              href="/record"
              className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${
                isActive("/record")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Nagrywaj</span>
            </Link>
            <Link
              href="/train"
              className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${
                isActive("/train")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Trenuj</span>
            </Link>
            <Link
              href="/edit"
              className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${
                isActive("/edit")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Edytuj</span>
            </Link>
            <Link
              href="/library"
              className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-2 text-xs font-medium rounded-lg transition-all ${
                isActive("/library")
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Library className="w-4 h-4" />
              <span>Biblioteka</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
