import type { Ref } from 'vue'
import { nextTick } from 'vue'
import { useAgentTool } from '@data-fair/lib-vue-agents'
import { createAgentTranslator, agentToolError } from '~/composables/agent/utils'
import { $fetch } from '~/context'
import { untilReady, formatAdvanceResult, resolveInitParts, INIT_FROM_PARTS } from './agent-creation-tools-logic'

const messages: Record<string, Record<string, string>> = {
  fr: {
    selectDatasetType: 'Choisir le type de jeu de données',
    setDatasetTitle: 'Définir le titre du jeu de données',
    setRestOptions: 'Configurer les options du jeu éditable',
    skipInitFromStep: 'Passer l\'étape d\'initialisation',
    initFromDataset: 'Initialiser depuis un jeu de données',
    advanceToConfirmation: 'Passer à la confirmation'
  },
  en: {
    selectDatasetType: 'Select dataset type',
    setDatasetTitle: 'Set dataset title',
    setRestOptions: 'Configure editable dataset options',
    skipInitFromStep: 'Skip initialization step',
    initFromDataset: 'Initialize from a dataset',
    advanceToConfirmation: 'Advance to confirmation'
  }
}

type DatasetType = 'file' | 'rest' | 'virtual' | 'metaOnly'

interface DatasetCreationState {
  step: Ref<string>
  datasetType: Ref<DatasetType | null>
  hasInitFromStep: Ref<boolean>
  paramsValid: Ref<boolean>
  /** The wizard's own readiness: params valid, conflict check passed, owner. */
  ready: Ref<boolean>
  /** The label the page shows on the next/create button right now. */
  actionLabel: Ref<string>
  restTitle: Ref<string>
  restHistory: Ref<boolean>
  restAttachments: Ref<boolean>
  restAttachmentsAsImage: Ref<boolean>
  virtualTitle: Ref<string>
  metaOnlyTitle: Ref<string>
  fileTitle: Ref<string>
  /** The source the init step shows as selected; the step fills initFrom from it. */
  initSource: Ref<any>
  initFrom: Ref<{ dataset: string, parts: string[] } | null>
  /** Whether the init step offers to copy the data (not for a fragment, only file/rest). */
  initAllowData: Ref<boolean>
  /** A fragment starts from its parent: the source is not the agent's to choose. */
  initLocked: Ref<boolean>
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
        ? 'The wizard is now on the initialization step (optional). If an existing dataset already has the structure wanted, call init_from_dataset so the new one is created with its columns; otherwise call skip_init_from_step.'
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
    name: 'init_from_dataset',
    description: 'Start the new dataset from an existing one, as the wizard\'s initialization step does: by default its columns (all its metadata for a metadata-only source); parts can also name its data, extensions, metadata attachments or single metadata fields. The new dataset is then created with those columns, so none need declaring afterwards and the person has a single button to press. Advances to the parameters step.',
    annotations: { title: t('initFromDataset') },
    inputSchema: {
      type: 'object' as const,
      properties: {
        datasetId: { type: 'string' as const, description: 'Id of the existing dataset to start from' },
        parts: { type: 'array' as const, items: { type: 'string' as const, enum: [...INIT_FROM_PARTS] }, description: 'What to copy instead of the default; the columns (schema) are always included from a dataset that has some' }
      },
      required: ['datasetId'] as const
    },
    execute: async (params) => {
      if (!state.hasInitFromStep.value) return agentToolError('init_from_dataset', 'This dataset type has no initialization step.')
      if (state.initLocked.value) return agentToolError('init_from_dataset', 'This new dataset is a fragment and already starts from its parent dataset.')
      let source: any
      try {
        source = await $fetch(`datasets/${encodeURIComponent(String(params.datasetId))}`)
      } catch {
        return agentToolError('init_from_dataset', `No dataset "${params.datasetId}" you can read — find its id with list_datasets.`)
      }
      const resolved = resolveInitParts(params.parts as string[] | undefined, source, { allowData: state.initAllowData.value })
      if ('error' in resolved) return agentToolError('init_from_dataset', resolved.error)
      // Shown as selected in the init step, which sets initFrom to its own default (the
      // columns, or all the metadata of a metadata-only source) and the source title;
      // parts asked for replace that default once it has.
      state.initSource.value = source
      await nextTick()
      if (resolved.parts) state.initFrom.value = { dataset: source.id, parts: resolved.parts }
      state.step.value = 'params'
      const copied = state.initFrom.value?.parts ?? []
      return `The new dataset will start from « ${source.title ?? source.id} », copying: ${copied.join(', ') || 'nothing yet'}. ` +
        'Its title was prefilled from the source; set the new one with set_dataset_title. The wizard is now on the parameters step.'
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
      // The confirmation step's conflict check only starts once that step mounts,
      // so returning here reported ready:false every time and the ready:true a
      // second later missed this result's drain window. Wait for it, bounded.
      await nextTick()
      const ready = await untilReady(() => state.ready.value, 5000)
      return formatAdvanceResult(ready, state.actionLabel.value)
    }
  })
}
