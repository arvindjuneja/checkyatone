"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Layers, Plus, Trash2, Play } from "lucide-react"
import { MultiTrackTimeline } from "@/components/timeline/multi-track-timeline"
import { createProject, type MultiTrackProject, multiTrackStorage } from "@/lib/multi-track-storage"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<MultiTrackProject[]>([])
  const [currentProject, setCurrentProject] = useState<MultiTrackProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    document.title = "Vocal Coach - Multi-track"
    trackPageView("Vocal Coach - Multi-track", "/edit/projects")
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setIsLoading(true)
      const allProjects = await multiTrackStorage.getAllProjects()
      setProjects(allProjects.sort((a, b) => b.updatedAt - a.updatedAt))
    } catch (error) {
      console.error("[Projects] Failed to load projects:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateProject = async () => {
    try {
      const projectId = await createProject(`Projekt ${projects.length + 1}`)
      await loadProjects()
      const newProject = await multiTrackStorage.getProject(projectId)
      if (newProject) {
        setCurrentProject(newProject)
      }
      trackEvent("multitrack_project_created", "Projects")
    } catch (error) {
      console.error("[Projects] Failed to create project:", error)
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Czy na pewno chcesz usunac ten projekt?")) return

    try {
      await multiTrackStorage.deleteProject(projectId)
      if (currentProject?.id === projectId) {
        setCurrentProject(null)
      }
      await loadProjects()
      trackEvent("multitrack_project_deleted", "Projects")
    } catch (error) {
      console.error("[Projects] Failed to delete project:", error)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  if (currentProject) {
    return (
      <div className="space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6 text-pitch-perfect" />
              {currentProject.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Ostatnia edycja: {formatDate(currentProject.updatedAt)}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setCurrentProject(null)}
          >
            Powrot do listy
          </Button>
        </div>

        <MultiTrackTimeline
          project={currentProject}
          onProjectUpdate={loadProjects}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-pitch-perfect" />
            Multi-track
          </h1>
          <p className="text-sm text-muted-foreground">
            Profesjonalny edytor wielosciezkowy w stylu DAW
          </p>
        </div>
        <Button onClick={handleCreateProject} className="gap-2">
          <Plus className="w-4 h-4" />
          Nowy projekt
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="bg-card rounded-xl p-8 border border-border text-center">
          <div className="animate-spin w-8 h-8 border-4 border-pitch-perfect border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground">Ladowanie projektow...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && projects.length === 0 && (
        <div className="bg-card rounded-xl p-8 border border-border text-center space-y-4">
          <Layers className="w-12 h-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-semibold mb-1">Brak projektow</h3>
            <p className="text-sm text-muted-foreground">
              Stworz swoj pierwszy projekt wielosciezkowy
            </p>
          </div>
          <Button onClick={handleCreateProject} className="gap-2">
            <Plus className="w-4 h-4" />
            Nowy projekt
          </Button>
        </div>
      )}

      {/* Projects list */}
      {!isLoading && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-card rounded-xl p-4 border border-border hover:border-pitch-perfect/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold">{project.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {project.trackIds.length} sciezek • Ostatnia edycja: {formatDate(project.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentProject(project)}
                    className="gap-2"
                  >
                    <Play className="w-3 h-3" />
                    Otworz
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteProject(project.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
