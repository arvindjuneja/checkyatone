"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Music2, Mic, Pause, RotateCcw, LayoutList, Maximize2, BookOpen, Gamepad2, Music } from "lucide-react"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeTab: "live" | "analysis" | "training" | "why"
  onTabChange: (tab: "live" | "analysis" | "training" | "why") => void
  onStartRecording: () => void
  onStopRecording: () => void
  onTogglePause: () => void
  onReset: () => void
  onToggleFocusMode: () => void
  onSelectTrainingMode?: (mode: "exercises" | "game" | "singalong") => void
  isRecording: boolean
  isPaused: boolean
}

export function CommandPalette({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  onStartRecording,
  onStopRecording,
  onTogglePause,
  onReset,
  onToggleFocusMode,
  onSelectTrainingMode,
  isRecording,
  isPaused,
}: CommandPaletteProps) {
  const runCommand = useCallback(
    (command: () => void) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Wpisz komendę lub szukaj..." />
      <CommandList>
        <CommandEmpty>Nie znaleziono wyników.</CommandEmpty>
        
        <CommandGroup heading="Nawigacja">
          <CommandItem
            onSelect={() => runCommand(() => onTabChange("live"))}
          >
            <Music2 className="mr-2 h-4 w-4" />
            <span>Na żywo</span>
            <span className="ml-auto text-xs text-muted-foreground">1</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onTabChange("training"))}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Trenuj</span>
            <span className="ml-auto text-xs text-muted-foreground">2</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onTabChange("analysis"))}
          >
            <LayoutList className="mr-2 h-4 w-4" />
            <span>Analiza</span>
            <span className="ml-auto text-xs text-muted-foreground">3</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onTabChange("why"))}
          >
            <Music className="mr-2 h-4 w-4" />
            <span>Po co?</span>
            <span className="ml-auto text-xs text-muted-foreground">4</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Nagrywanie">
          {!isRecording ? (
            <CommandItem
              onSelect={() => runCommand(onStartRecording)}
            >
              <Mic className="mr-2 h-4 w-4" />
              <span>Start nagrywania</span>
              <span className="ml-auto text-xs text-muted-foreground">R</span>
            </CommandItem>
          ) : (
            <>
              <CommandItem
                onSelect={() => runCommand(onStopRecording)}
              >
                <Mic className="mr-2 h-4 w-4" />
                <span>Stop nagrywania</span>
                <span className="ml-auto text-xs text-muted-foreground">R</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(onTogglePause)}
              >
                <Pause className="mr-2 h-4 w-4" />
                <span>{isPaused ? "Wznów" : "Pauza"}</span>
                <span className="ml-auto text-xs text-muted-foreground">Space</span>
              </CommandItem>
            </>
          )}
          <CommandItem
            onSelect={() => runCommand(onReset)}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            <span>Reset nagrania</span>
          </CommandItem>
        </CommandGroup>


        {activeTab === "training" && onSelectTrainingMode && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tryb treningowy">
              <CommandItem
                onSelect={() => runCommand(() => onSelectTrainingMode("exercises"))}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                <span>Ćwiczenia</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => onSelectTrainingMode("game"))}
              >
                <Gamepad2 className="mr-2 h-4 w-4" />
                <span>Hit the Note!</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => onSelectTrainingMode("singalong"))}
              >
                <Music className="mr-2 h-4 w-4" />
                <span>Śpiewaj z piosenką</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Widok">
          <CommandItem
            onSelect={() => runCommand(onToggleFocusMode)}
          >
            <Maximize2 className="mr-2 h-4 w-4" />
            <span>Focus mode</span>
            <span className="ml-auto text-xs text-muted-foreground">F</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
