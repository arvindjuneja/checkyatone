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
  pathname: string
  onNavigate: (path: string) => void
  onStartRecording: () => void
  onStopRecording: () => void
  onTogglePause: () => void
  onReset: () => void
  onToggleFocusMode: () => void
  isRecording: boolean
  isPaused: boolean
}

export function CommandPalette({
  open,
  onOpenChange,
  pathname,
  onNavigate,
  onStartRecording,
  onStopRecording,
  onTogglePause,
  onReset,
  onToggleFocusMode,
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
            onSelect={() => runCommand(() => onNavigate("/"))}
          >
            <Music2 className="mr-2 h-4 w-4" />
            <span>Na żywo</span>
            <span className="ml-auto text-xs text-muted-foreground">1</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/training"))}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Trenuj</span>
            <span className="ml-auto text-xs text-muted-foreground">2</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/analysis"))}
          >
            <LayoutList className="mr-2 h-4 w-4" />
            <span>Analiza</span>
            <span className="ml-auto text-xs text-muted-foreground">3</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/about"))}
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


        {pathname.startsWith("/training") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tryb treningowy">
              <CommandItem
                onSelect={() => runCommand(() => onNavigate("/training/exercises"))}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                <span>Ćwiczenia</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => onNavigate("/training/game"))}
              >
                <Gamepad2 className="mr-2 h-4 w-4" />
                <span>Hit the Note!</span>
              </CommandItem>
              <CommandItem
                onSelect={() => runCommand(() => onNavigate("/training/singalong"))}
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
