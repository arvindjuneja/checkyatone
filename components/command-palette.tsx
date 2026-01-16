"use client"

import { useCallback } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Home,
  Mic,
  Pause,
  RotateCcw,
  Maximize2,
  BookOpen,
  Gamepad2,
  Music,
  Radio,
  Sparkles,
  Layers,
  Library,
  TrendingUp,
  Settings
} from "lucide-react"

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
      <CommandInput placeholder="Wpisz komende lub szukaj..." />
      <CommandList>
        <CommandEmpty>Nie znaleziono wynikow.</CommandEmpty>

        <CommandGroup heading="Nawigacja">
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/"))}
          >
            <Home className="mr-2 h-4 w-4" />
            <span>Start</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Nagrywaj">
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/record/live"))}
          >
            <Radio className="mr-2 h-4 w-4" />
            <span>Na zywo</span>
            <span className="ml-auto text-xs text-muted-foreground">1</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/record/karaoke"))}
          >
            <Music className="mr-2 h-4 w-4" />
            <span>Karaoke</span>
            <span className="ml-auto text-xs text-muted-foreground">2</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Trenuj">
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/train/exercises"))}
          >
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Cwiczenia</span>
            <span className="ml-auto text-xs text-muted-foreground">3</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/train/game"))}
          >
            <Gamepad2 className="mr-2 h-4 w-4" />
            <span>Hit the Note!</span>
            <span className="ml-auto text-xs text-muted-foreground">4</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/train/singalong"))}
          >
            <Music className="mr-2 h-4 w-4" />
            <span>Spiewaj z piosenka</span>
            <span className="ml-auto text-xs text-muted-foreground">5</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Edytuj">
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/edit/studio"))}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Studio</span>
            <span className="ml-auto text-xs text-muted-foreground">6</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/edit/projects"))}
          >
            <Layers className="mr-2 h-4 w-4" />
            <span>Multi-track</span>
            <span className="ml-auto text-xs text-muted-foreground">7</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Biblioteka">
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/library"))}
          >
            <Library className="mr-2 h-4 w-4" />
            <span>Wszystkie sesje</span>
            <span className="ml-auto text-xs text-muted-foreground">8</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/library/progress"))}
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            <span>Postepy</span>
            <span className="ml-auto text-xs text-muted-foreground">9</span>
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
                <span>{isPaused ? "Wznow" : "Pauza"}</span>
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

        <CommandSeparator />

        <CommandGroup heading="Inne">
          <CommandItem
            onSelect={() => runCommand(() => onNavigate("/settings"))}
          >
            <Settings className="mr-2 h-4 w-4" />
            <span>Ustawienia</span>
            <span className="ml-auto text-xs text-muted-foreground">0</span>
          </CommandItem>
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
