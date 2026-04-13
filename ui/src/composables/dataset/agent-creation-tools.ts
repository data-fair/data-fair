import type { Ref } from 'vue'
import { nextTick } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, agentToolError } from '~/composables/agent/utils'

const messages: Record<string, Record<string, string>> = {
  fr: {
    selectDatasetType: 'Choisir le type de jeu de données',
    setDatasetTitle: 'Définir le titre du jeu de données',
    setRestOptions: 'Configurer les options du jeu éditable',
    skipInitFromStep: 'Passer l\'étape d\'initialisation',
    advanceToConfirmation: 'Passer à la confirmation'
  },
  en: {
    selectDatasetType: 'Select dataset type',
    setDatasetTitle: 'Set dataset title',
    setRestOptions: 'Configure editable dataset options',
    skipInitFromStep: 'Skip initialization step',
    advanceToConfirmation: 'Advance to confirmation'
  }
}

type DatasetType = 'file' | 'rest' | 'virtual' | 'metaOnly'

interface DatasetCreationState {
  step: Ref<string>
  datasetType: Ref<DatasetType | null>
  hasInitFromStep: Ref<boolean>
  paramsValid: Ref<boolean>
  restTitle: Ref<string>
  restHistory: Ref<boolean>
  restAttachments: Ref<boolean>
  restAttachmentsAsImage: Ref<boolean>
  virtualTitle: Ref<string>
  metaOnlyTitle: Ref<string>
  fileTitle: Ref<string>
}

export function useAgentDatasetCreationTools (locale: Ref<string>, state: DatasetCreationState) {
  const t = createAgentTranslator(messages, locale)

  useAgentTool({
    name: 'select_dataset_type',
    description: 'Select the dataset type and advance the wizard. Types: "file" (upload a file), "rest" (editable dataset with form entry), "virtual" (combined view over existing datasets), "metaOnly" (metadata-only, no data).',
    annotations: { title: t('selectDatasetType') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string' as const, enum: ['file', 'rest', 'virtual', 'metaOnly'], description: 'The dataset type' }
      },
      required: ['type'] as const
    },
    execute: async (params) => {
      const type = params.type as DatasetType
      state.datasetType.value = type
      await nextTick()
      if (type === 'file' || type === 'rest') {
        state.step.value = 'init'
      } else {
        state.step.value = 'params'
      }
      const typeLabels: Record<DatasetType, string> = {
        file: 'File',
        rest: 'Editable (REST)',
        virtual: 'Virtual',
        metaOnly: 'Metadata only'
      }
      const nextStep = type === 'file' || type === 'rest'
        ? 'The wizard is now on the initialization step (optional). You can call skip_init_from_step to proceed to parameters, or let the user configure initialization from an existing dataset.'
        : 'The wizard is now on the parameters step.'
      return `Dataset type set to "${typeLabels[type]}". ${nextStep}`
    }
  })

  useAgentTool({
    name: 'set_dataset_title',
    description: 'Set the title for the dataset being created. Must be at least 4 characters.',
    annotations: { title: t('setDatasetTitle') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const, description: 'The dataset title (min 4 characters)' }
      },
      required: ['title'] as const
    },
    execute: async (params) => {
      if (params.title.length <= 3) {
        return agentToolError('set_dataset_title', 'Title must be at least 4 characters.')
      }
      if (!state.datasetType.value) {
        return agentToolError('set_dataset_title', 'Select a dataset type first.')
      }
      switch (state.datasetType.value) {
        case 'file':
          state.fileTitle.value = params.title
          break
        case 'rest':
          state.restTitle.value = params.title
          break
        case 'virtual':
          state.virtualTitle.value = params.title
          break
        case 'metaOnly':
          state.metaOnlyTitle.value = params.title
          break
      }
      return `Dataset title set to "${params.title}".`
    }
  })

  useAgentTool({
    name: 'set_rest_options',
    description: 'Configure options for an editable (REST) dataset. Only works when dataset type is "rest".',
    annotations: { title: t('setRestOptions') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        history: { type: 'boolean' as const, description: 'Keep full revision history of lines' },
        attachments: { type: 'boolean' as const, description: 'Accept file attachments on lines' },
        attachmentsAsImage: { type: 'boolean' as const, description: 'Treat attachments as images' }
      }
    },
    execute: async (params) => {
      if (state.datasetType.value !== 'rest') {
        return agentToolError('set_rest_options', 'Dataset type must be "rest".')
      }
      const changes: string[] = []
      if (params.history !== undefined) {
        state.restHistory.value = params.history
        changes.push(`history: ${params.history}`)
      }
      if (params.attachments !== undefined) {
        state.restAttachments.value = params.attachments
        changes.push(`attachments: ${params.attachments}`)
      }
      if (params.attachmentsAsImage !== undefined) {
        state.restAttachmentsAsImage.value = params.attachmentsAsImage
        changes.push(`attachmentsAsImage: ${params.attachmentsAsImage}`)
      }
      return `REST options updated: ${changes.join(', ')}.`
    }
  })

  useAgentTool({
    name: 'skip_init_from_step',
    description: 'Skip the optional initialization step (for file/rest types) and advance to the parameters step.',
    annotations: { title: t('skipInitFromStep') },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      if (!state.hasInitFromStep.value) {
        return agentToolError('skip_init_from_step', 'No initialization step to skip for this dataset type.')
      }
      state.step.value = 'params'
      return 'Initialization step skipped. The wizard is now on the parameters step.'
    }
  })

  useAgentTool({
    name: 'advance_to_confirmation',
    description: 'Advance the wizard to the final confirmation step. Only works when the parameters are valid (title set, etc.).',
    annotations: { title: t('advanceToConfirmation') },
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    execute: async () => {
      if (!state.paramsValid.value) {
        return agentToolError('advance_to_confirmation', 'Parameters are not valid yet. Make sure the title is set and all required fields are filled.')
      }
      state.step.value = 'action'
      return 'The wizard is now on the confirmation step. The user can review and click Create.'
    }
  })
}
