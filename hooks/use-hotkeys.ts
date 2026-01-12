import { useEffect, useCallback } from "react"

export type HotkeyHandler = () => void

interface Hotkey {
  key: string
  handler: HotkeyHandler
  description: string
  preventDefault?: boolean
  allowInInput?: boolean
}

interface UseHotkeysOptions {
  enabled?: boolean
}

export function useHotkeys(hotkeys: Hotkey[], options: UseHotkeysOptions = {}) {
  const { enabled = true } = options

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Check if user is typing in an input/textarea/contenteditable
      const target = event.target as HTMLElement
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable

      // Find matching hotkey
      const hotkey = hotkeys.find((h) => {
        const keyMatches = event.key.toLowerCase() === h.key.toLowerCase()
        const canTrigger = h.allowInInput || !isTyping
        return keyMatches && canTrigger
      })

      if (hotkey) {
        if (hotkey.preventDefault) {
          event.preventDefault()
        }
        hotkey.handler()
      }
    },
    [hotkeys, enabled]
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown, enabled])
}

export function getHotkeyLabel(key: string): string {
  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac")
  
  if (key === "mod") {
    return isMac ? "⌘" : "Ctrl"
  }
  
  return key.toUpperCase()
}
