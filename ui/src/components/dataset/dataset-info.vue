<template>
  <div v-if="dataset">
    <v-text-field
      v-model="dataset.title"
      :disabled="!can('writeDescription')"
      :label="t('title')"
      variant="outlined"
      density="compact"
      hide-details
      class="mb-3"
    />

    <div class="d-flex align-start gap-1 mb-3">
      <v-textarea
        v-model="dataset.summary"
        :disabled="!can('writeDescription')"
        :label="t('summary')"
        rows="3"
        variant="outlined"
        density="compact"
        hide-details
        class="flex-grow-1"
      />
      <df-agent-chat-action
        v-if="showAgentChat && can('writeDescription')"
        action-id="summarize-dataset"
        :visible-prompt="t('summarizePrompt')"
        :hidden-context="summarizeContext"
        :btn-props="{ class: 'ml-1 mt-1' }"
      />
    </div>

    <markdown-editor
      v-model="dataset.description"
      :disabled="!can('writeDescription')"
      :label="t('description')"
      :locale="locale"
      :csp-nonce="$cspNonce"
    />

  </div>
</template>

<i18n lang="yaml">
fr:
  title: Titre
  summary: Résumé
  summarizePrompt: Aide-moi à rédiger un résumé pour ce jeu de données
  description: Description
en:
  title: Title
  summary: Summary
  summarizePrompt: Help me write a summary for this dataset
  description: Description
</i18n>

<script setup lang="ts">
import { MarkdownEditor } from '@koumoul/vjsf-markdown'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useShowAgentChat } from '~/composables/agent/use-show-chat'

const showAgentChat = useShowAgentChat()

const dataset = defineModel<any>({ required: true })

const { t, locale } = useI18n()

const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false

const summarizeContext = computed(() => {
  return `Use the subagent_summarizer tool to read the dataset information and produce a summary. Then use the set_dataset_summary tool to set the summary on the form. The dataset ID is "${dataset.value?.id}".`
})
</script>
