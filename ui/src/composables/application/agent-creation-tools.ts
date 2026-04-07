import type { Ref } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { $fetch } from '~/context'
import { createAgentTranslator, agentToolError } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    selectCreationType: 'Choisir le type de création',
    selectBaseApplication: 'Sélectionner un modèle d\'application',
    selectCopyApplication: 'Sélectionner une application à copier',
    setApplicationTitle: 'Définir le titre de l\'application'
  },
  en: {
    selectCreationType: 'Select creation type',
    selectBaseApplication: 'Select a base application',
    selectCopyApplication: 'Select an application to copy',
    setApplicationTitle: 'Set application title'
  }
}

interface ApplicationCreationState {
  step: Ref<string>
  creationType: Ref<'copy' | 'baseApp' | null>
  selectedBaseApp: Ref<any>
  copyApp: Ref<any>
  appTitle: Ref<string>
  baseAppsFetch: { data: Ref<any> }
  datasetId: Ref<string | undefined>
  dataset: Ref<any>
}

export function useAgentApplicationCreationTools (locale: Ref<string>, state: ApplicationCreationState) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'select_creation_type',
    description: 'Select the application creation type: "baseApp" to create from a template, or "copy" to copy an existing application. Advances the wizard to step 2.',
    annotations: { title: t('selectCreationType') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string' as const, enum: ['copy', 'baseApp'], description: 'The creation type' }
      },
      required: ['type'] as const
    },
    execute: async (params) => {
      state.creationType.value = params.type as 'copy' | 'baseApp'
      state.step.value = 'selection'
      return `Creation type set to "${params.type}". The wizard is now on step 2.`
    }
  })

  useAgentTool({
    name: 'select_base_application',
    description: 'Select a base application template by its ID. The creation type must be "baseApp" first. Sets the title and advances the wizard to step 3.',
    annotations: { title: t('selectBaseApplication') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const, description: 'The base application ID' }
      },
      required: ['id'] as const
    },
    execute: async (params) => {
      if (state.creationType.value !== 'baseApp') {
        return agentToolError('select_base_application', 'Creation type must be "baseApp". Call select_creation_type first.')
      }

      // Wait for base apps to be fetched if not yet loaded
      const apps = state.baseAppsFetch.data.value?.results
      if (!apps) {
        return agentToolError('select_base_application', 'Base applications are still loading. Try again shortly.')
      }

      const baseApp = apps.find((a: any) => a.id === params.id)
      if (!baseApp) {
        return agentToolError('select_base_application', `Base application "${params.id}" not found. Use list_base_applications to see available options.`)
      }
      if (baseApp.disabled?.length) {
        return agentToolError('select_base_application', `Base application "${baseApp.title}" is disabled: ${baseApp.disabled.join(', ')}`)
      }

      state.selectedBaseApp.value = baseApp
      if (state.dataset.value) {
        state.appTitle.value = `${state.dataset.value.title} - ${baseApp.title}`
      } else {
        state.appTitle.value = baseApp.title || ''
      }
      state.step.value = 'info'
      return `Selected base application "${baseApp.title}". Title set to "${state.appTitle.value}". The wizard is now on step 3 (confirmation). The user can review and click Save.`
    }
  })

  useAgentTool({
    name: 'select_copy_application',
    description: 'Select an existing application to copy by its ID. The creation type must be "copy" first. Sets the title and advances the wizard to step 3.',
    annotations: { title: t('selectCopyApplication') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' as const, description: 'The application ID to copy' }
      },
      required: ['id'] as const
    },
    execute: async (params) => {
      if (state.creationType.value !== 'copy') {
        return agentToolError('select_copy_application', 'Creation type must be "copy". Call select_creation_type first.')
      }

      try {
        const app = await $fetch<any>(`applications/${encodeURIComponent(params.id)}`, {
          query: { select: 'id,title,url' }
        })
        state.copyApp.value = app
        state.appTitle.value = `${app.title} (copie)`
        state.step.value = 'info'
        return `Selected application "${app.title}" to copy. Title set to "${state.appTitle.value}". The wizard is now on step 3 (confirmation). The user can review and click Save.`
      } catch (err) {
        return agentToolError('select_copy_application', err)
      }
    }
  })

  useAgentTool({
    name: 'set_application_title',
    description: 'Set or update the title of the new application.',
    annotations: { title: t('setApplicationTitle') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const, description: 'The application title' }
      },
      required: ['title'] as const
    },
    execute: async (params) => {
      state.appTitle.value = params.title
      return `Application title set to "${params.title}".`
    }
  })
}
