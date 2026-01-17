"use client"

import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import type { ProjectTemplate } from "@/lib/project-templates"

interface TemplateCardProps {
  template: ProjectTemplate
  onSelect: (template: ProjectTemplate) => void
  onDelete?: (templateId: string) => void
  isSelected?: boolean
}

export function TemplateCard({
  template,
  onSelect,
  onDelete,
  isSelected = false,
}: TemplateCardProps) {
  return (
    <div
      className={`
        relative p-4 rounded-xl border-2 cursor-pointer transition-all
        hover:border-primary/50 hover:bg-secondary/20
        ${isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card'
        }
      `}
      onClick={() => onSelect(template)}
    >
      {/* Delete button for custom templates */}
      {!template.isBuiltIn && onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2 text-destructive hover:text-destructive hover:bg-destructive/20"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(template.id)
          }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      )}

      {/* Icon */}
      <div className="text-3xl mb-2">{template.icon}</div>

      {/* Name */}
      <h3 className="font-semibold text-sm mb-1">{template.name}</h3>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2">
        {template.description}
      </p>

      {/* Track count */}
      {template.tracks.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground/70">
          {template.tracks.length} {template.tracks.length === 1 ? 'ścieżka' : 'ścieżek'}
        </div>
      )}

      {/* Track colors preview */}
      {template.tracks.length > 0 && (
        <div className="flex gap-1 mt-2">
          {template.tracks.slice(0, 5).map((track, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: track.color }}
              title={track.name}
            />
          ))}
          {template.tracks.length > 5 && (
            <span className="text-[10px] text-muted-foreground">
              +{template.tracks.length - 5}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
