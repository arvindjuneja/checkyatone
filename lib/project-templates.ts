// Project templates for quick project creation

import {
  createProject,
  createTrack,
  multiTrackStorage,
  createAutomationLaneForTrack,
  updateTrack,
  type Track,
  type TrackProcessing,
} from './multi-track-storage'
import type { AutomationParameter } from './automation'

// Template track configuration
export interface TemplateTrack {
  name: string
  color: string
  processing?: TrackProcessing
  automationLanes?: {
    parameter: AutomationParameter
    visible: boolean
  }[]
}

// Project template definition
export interface ProjectTemplate {
  id: string
  name: string
  description: string
  icon: string
  isBuiltIn: boolean
  tracks: TemplateTrack[]
}

// Built-in templates
export const BUILT_IN_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'podcast',
    name: 'Podcast',
    description: 'Gotowy setup do podcastu z muzyką tła i duckingiem',
    icon: '🎙️',
    isBuiltIn: true,
    tracks: [
      {
        name: 'Głos',
        color: '#3b82f6', // blue
        processing: {
          enabled: true,
          eqLow: -2, // Reduce low end rumble
          eqMid: 2,  // Boost presence
          eqHigh: 1, // Slight air
        },
        automationLanes: [
          { parameter: 'volume', visible: false },
        ],
      },
      {
        name: 'Muzyka tła',
        color: '#8b5cf6', // purple
        processing: {
          enabled: true,
          eqLow: 0,
          eqMid: -2, // Cut mids to leave room for voice
          eqHigh: 0,
        },
        automationLanes: [
          { parameter: 'volume', visible: true }, // Main ducking lane
          { parameter: 'eqMid', visible: false }, // For frequency ducking
        ],
      },
    ],
  },
  {
    id: 'music',
    name: 'Muzyka',
    description: 'Wielościeżkowy projekt do produkcji muzycznej',
    icon: '🎵',
    isBuiltIn: true,
    tracks: [
      {
        name: 'Wokal',
        color: '#ec4899', // pink
        processing: {
          enabled: true,
          eqLow: -3,
          eqMid: 0,
          eqHigh: 2,
        },
        automationLanes: [
          { parameter: 'volume', visible: true },
        ],
      },
      {
        name: 'Instrumenty',
        color: '#f59e0b', // amber
        processing: {
          enabled: false,
          eqLow: 0,
          eqMid: 0,
          eqHigh: 0,
        },
        automationLanes: [
          { parameter: 'volume', visible: true },
          { parameter: 'pan', visible: false },
        ],
      },
      {
        name: 'Perkusja',
        color: '#10b981', // emerald
        processing: {
          enabled: true,
          eqLow: 2,
          eqMid: -1,
          eqHigh: 1,
        },
        automationLanes: [
          { parameter: 'volume', visible: false },
        ],
      },
    ],
  },
  {
    id: 'empty',
    name: 'Pusty',
    description: 'Pusty projekt do własnej konfiguracji',
    icon: '➕',
    isBuiltIn: true,
    tracks: [],
  },
]

// IndexedDB store name for custom templates
const TEMPLATES_STORE = 'templates'

// Create a project from a template
export async function createProjectFromTemplate(
  projectName: string,
  template: ProjectTemplate
): Promise<string> {
  // Create the project
  const projectId = await createProject(projectName)

  // Create tracks from template
  for (const trackConfig of template.tracks) {
    const trackId = await createTrack(projectId, trackConfig.name)

    // Update track with template settings
    await updateTrack(trackId, {
      color: trackConfig.color,
      processing: trackConfig.processing,
    })

    // Create automation lanes
    if (trackConfig.automationLanes) {
      for (const laneConfig of trackConfig.automationLanes) {
        await createAutomationLaneForTrack(
          trackId,
          laneConfig.parameter,
          laneConfig.visible
        )
      }
    }
  }

  return projectId
}

// Get all templates (built-in + custom)
export async function getAllTemplates(): Promise<ProjectTemplate[]> {
  const customTemplates = await getCustomTemplates()
  return [...BUILT_IN_TEMPLATES, ...customTemplates]
}

// Get custom templates from storage
export async function getCustomTemplates(): Promise<ProjectTemplate[]> {
  try {
    const db = await openTemplatesDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([TEMPLATES_STORE], 'readonly')
      const store = transaction.objectStore(TEMPLATES_STORE)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch {
    return []
  }
}

// Save current project as a custom template
export async function saveProjectAsTemplate(
  projectId: string,
  templateName: string,
  description: string,
  icon: string = '📁'
): Promise<string> {
  const project = await multiTrackStorage.getProject(projectId)
  if (!project) throw new Error('Project not found')

  const tracks = await multiTrackStorage.getProjectTracks(projectId)

  // Build template tracks from project tracks
  const templateTracks: TemplateTrack[] = []
  for (const track of tracks) {
    const lanes = await multiTrackStorage.getTrackAutomationLanes(track.id)

    templateTracks.push({
      name: track.name,
      color: track.color,
      processing: track.processing,
      automationLanes: lanes.map(lane => ({
        parameter: lane.parameter,
        visible: lane.visible,
      })),
    })
  }

  const template: ProjectTemplate = {
    id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: templateName,
    description,
    icon,
    isBuiltIn: false,
    tracks: templateTracks,
  }

  // Save to IndexedDB
  const db = await openTemplatesDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEMPLATES_STORE], 'readwrite')
    const store = transaction.objectStore(TEMPLATES_STORE)
    const request = store.put(template)

    request.onsuccess = () => resolve(template.id)
    request.onerror = () => reject(request.error)
  })
}

// Delete a custom template
export async function deleteCustomTemplate(templateId: string): Promise<void> {
  const db = await openTemplatesDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TEMPLATES_STORE], 'readwrite')
    const store = transaction.objectStore(TEMPLATES_STORE)
    const request = store.delete(templateId)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// Open or create the templates database
function openTemplatesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open('vocal-coach-templates', 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(TEMPLATES_STORE)) {
        db.createObjectStore(TEMPLATES_STORE, { keyPath: 'id' })
      }
    }
  })
}

// Template icons for picker
export const TEMPLATE_ICONS = [
  '🎙️', '🎵', '🎸', '🎹', '🎤', '🎧', '📻', '🎺',
  '🥁', '🎻', '🎷', '📁', '🎬', '📺', '🎮', '🔊',
]
