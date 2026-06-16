<template>
  <v-row v-if="application">
    <!-- Left column: primary fields -->
    <v-col
      cols="12"
      md="6"
      lg="7"
    >
      <v-text-field
        v-model="application.title"
        :disabled="!can('writeDescription')"
        :label="t('title')"
        :base-color="fieldColor('title')"
        :color="fieldColor('title')"
        variant="outlined"
        density="compact"
        hide-details
        class="mb-4"
      />

      <div class="d-flex align-start gap-1 mb-4">
        <v-textarea
          v-model="application.summary"
          :disabled="!can('writeDescription')"
          :label="t('summary')"
          :base-color="fieldColor('summary')"
          :color="fieldColor('summary')"
          rows="3"
          variant="outlined"
          density="compact"
          hide-details
          class="flex-grow-1"
        />
        <df-agent-chat-action
          v-if="can('writeDescription')"
          action-id="summarize-application"
          :visible-prompt="t('summarizePrompt')"
          :hidden-context="summarizeContext"
          :btn-props="{ class: 'ml-1' }"
          :title="t('summarizePrompt')"
        />
      </div>

      <div class="d-flex align-start gap-1 mb-3">
        <markdown-editor
          v-model="application.description"
          :read-only="!can('writeDescription')"
          :label="t('description')"
          :locale="locale"
          :csp-nonce="$cspNonce"
          :input-props="{ class: 'flex-grow-1' }"
        />
        <df-agent-chat-action
          v-if="can('writeDescription')"
          action-id="describe-application"
          :visible-prompt="t('describePrompt')"
          :hidden-context="describeContext"
          :btn-props="{ class: 'ml-1 mt-6' }"
          :title="t('describePrompt')"
        />
      </div>
    </v-col>

    <!-- Right column: secondary fields -->
    <v-col
      cols="12"
      md="6"
      lg="5"
    >
      <v-select
        v-if="topicsFetch.data.value?.length"
        v-model="application.topics"
        :items="topicsFetch.data.value ?? []"
        :disabled="!can('writeDescription')"
        :label="t('topics')"
        :base-color="fieldColor('topics')"
        :color="fieldColor('topics')"
        item-title="title"
        item-value="id"
        class="mb-4"
        chips
        multiple
        hide-details
        return-object
        closable-chips
      />

      <v-text-field
        v-model="application.image"
        :disabled="!can('writeDescription')"
        :label="t('image')"
        :base-color="fieldColor('image')"
        :color="fieldColor('image')"
        class="mb-4"
        clearable
        hide-details
      />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  title: Titre
  summary: Résumé
  description: Description
  topics: Thématiques
  image: Adresse d'une image utilisée comme vignette
  summarizePrompt: Aide-moi à rédiger un résumé pour cette application
  describePrompt: Aide-moi à rédiger une description pour cette application
en:
  title: Title
  summary: Summary
  description: Description
  topics: Topics
  image: URL of an image used as thumbnail
  summarizePrompt: Help me write a summary for this application
  describePrompt: Help me write a description for this application
</i18n>

<script setup lang="ts">
import equal from 'fast-deep-equal'
import { MarkdownEditor } from '@koumoul/vjsf-markdown'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { $cspNonce } from '~/context'

const application = defineModel<any>({ required: true })

const props = defineProps<{
  serverData?: any
}>()

const { t, locale } = useI18n()

const summarizeContext = computed(() =>
  `The user wants help writing a summary for application "${application.value?.id}". ` +
  'Use the application_summarizer subagent to produce a summary, passing it that applicationId. ' +
  'Once you receive the summary, present it to the user and ask for their approval before applying it. ' +
  'If approved, use the set_application_summary tool to set it. If the user wants changes, adjust accordingly.'
)
const describeContext = computed(() =>
  `The user wants help writing a description for application "${application.value?.id}". ` +
  'The description field supports markdown and should be more detailed than the summary. ' +
  'Ask the user what aspects they want to emphasize or any specific requirements, then use the ' +
  'application_description_writer subagent, passing it that applicationId. ' +
  'Once you receive the description, present it to the user and ask for their approval before applying it. ' +
  'If approved, use the set_application_description tool to set it. If the user wants changes, adjust accordingly.'
)

const can = (op: string) => application.value?.userPermissions?.includes(op) ?? false

const owner = computed(() => application.value?.owner)
const topicsFetch = useFetch<any[]>(() => owner.value ? `${$apiPath}/settings/${owner.value.type}/${owner.value.id}/topics` : null)

const fieldColor = (field: string): string | undefined => {
  if (!props.serverData) return undefined
  const current = application.value?.[field]
  const original = props.serverData?.[field]
  return !equal(current, original) ? 'accent' : undefined
}
</script>
