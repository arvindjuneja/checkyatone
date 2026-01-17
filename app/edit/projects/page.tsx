"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { trackPageView, trackEvent } from "@/lib/analytics"
import { Layers, Plus, Trash2, Play, X, Save } from "lucide-react"
import { MultiTrackTimeline } from "@/components/timeline/multi-track-timeline"
import { type MultiTrackProject, multiTrackStorage } from "@/lib/multi-track-storage"
import { TemplateCard } from "@/components/template-card"
import {
  type ProjectTemplate,
  getAllTemplates,
  createProjectFromTemplate,
  saveProjectAsTemplate,
  deleteCustomTemplate,
  TEMPLATE_ICONS,
} from "@/lib/project-templates"

export default function ProjectsPage() {
  const [projects, setProjects] = useState<MultiTrackProject[]>([])
  const [currentProject, setCurrentProject] = useState<MultiTrackProject | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Template selector state
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [templates, setTemplates] = useState<ProjectTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null)
  const [newProjectName, setNewProjectName] = useState("")

  // Save as template state
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateIcon, setTemplateIcon] = useState("📁")

  useEffect(() => {
    document.title = "Vocal Coach - Multi-track"
    trackPageView("Vocal Coach - Multi-track", "/edit/projects")
    loadProjects()
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const allTemplates = await getAllTemplates()
      setTemplates(allTemplates)
      // Default to first template (podcast)
      if (allTemplates.length > 0 && !selectedTemplate) {
        setSelectedTemplate(allTemplates[0])
      }
    } catch (error) {
      console.error("[Projects] Failed to load templates:", error)
    }
  }

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

  const handleOpenTemplateModal = () => {
    setNewProjectName(`Projekt ${projects.length + 1}`)
    setShowTemplateModal(true)
  }

  const handleCreateProject = async () => {
    if (!selectedTemplate || !newProjectName.trim()) return

    try {
      const projectId = await createProjectFromTemplate(
        newProjectName.trim(),
        selectedTemplate
      )
      await loadProjects()
      const newProject = await multiTrackStorage.getProject(projectId)
      if (newProject) {
        setCurrentProject(newProject)
      }
      setShowTemplateModal(false)
      setNewProjectName("")
      trackEvent("multitrack_project_created", "Projects", selectedTemplate.id)
    } catch (error) {
      console.error("[Projects] Failed to create project:", error)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten szablon?")) return

    try {
      await deleteCustomTemplate(templateId)
      await loadTemplates()
      trackEvent("template_deleted", "Projects")
    } catch (error) {
      console.error("[Projects] Failed to delete template:", error)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!currentProject || !templateName.trim()) return

    try {
      await saveProjectAsTemplate(
        currentProject.id,
        templateName.trim(),
        templateDescription.trim(),
        templateIcon
      )
      await loadTemplates()
      setShowSaveTemplateModal(false)
      setTemplateName("")
      setTemplateDescription("")
      setTemplateIcon("📁")
      trackEvent("template_saved", "Projects")
    } catch (error) {
      console.error("[Projects] Failed to save template:", error)
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowSaveTemplateModal(true)}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Zapisz jako szablon
            </Button>
            <Button
              variant="outline"
              onClick={() => setCurrentProject(null)}
            >
              Powrot do listy
            </Button>
          </div>
        </div>

        <MultiTrackTimeline
          project={currentProject}
          onProjectUpdate={loadProjects}
        />

        {/* Save as Template Modal */}
        {showSaveTemplateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-card rounded-xl border border-border p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Zapisz jako szablon</h2>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowSaveTemplateModal(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Icon selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Ikona</label>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATE_ICONS.map((icon) => (
                      <button
                        key={icon}
                        onClick={() => setTemplateIcon(icon)}
                        className={`w-10 h-10 text-xl rounded-lg border-2 transition-colors ${
                          templateIcon === icon
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template name */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Nazwa szablonu</label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Np. Mój podcast"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Template description */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Opis (opcjonalny)</label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Krótki opis szablonu..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                <Button
                  onClick={handleSaveAsTemplate}
                  disabled={!templateName.trim()}
                  className="w-full"
                >
                  Zapisz szablon
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const builtInTemplates = templates.filter(t => t.isBuiltIn)
  const customTemplates = templates.filter(t => !t.isBuiltIn)

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
        <Button onClick={handleOpenTemplateModal} className="gap-2">
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
          <Button onClick={handleOpenTemplateModal} className="gap-2">
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

      {/* Template Selector Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-xl border border-border p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Nowy projekt</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowTemplateModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Built-in templates */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">SZABLONY</h3>
              <div className="grid grid-cols-3 gap-3">
                {builtInTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={setSelectedTemplate}
                    isSelected={selectedTemplate?.id === template.id}
                  />
                ))}
              </div>
            </div>

            {/* Custom templates */}
            {customTemplates.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">MOJE SZABLONY</h3>
                <div className="grid grid-cols-3 gap-3">
                  {customTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onSelect={setSelectedTemplate}
                      onDelete={handleDeleteTemplate}
                      isSelected={selectedTemplate?.id === template.id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Project name input */}
            <div className="border-t border-border pt-4">
              <label className="text-sm font-medium mb-2 block">Nazwa projektu</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Np. Podcast #1"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-4"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateProject()
                  }
                }}
              />

              <Button
                onClick={handleCreateProject}
                disabled={!selectedTemplate || !newProjectName.trim()}
                className="w-full"
              >
                Utwórz projekt
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
