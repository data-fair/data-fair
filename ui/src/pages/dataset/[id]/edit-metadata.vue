<template>
  <v-container v-if="datasetEditFetch.data.value">
    <v-row class="dataset">
      <v-col
        cols="12"
        md="8"
      >
        <dataset-info v-model="datasetEditFetch.data.value" />
      </v-col>
      <v-col
        cols="12"
        md="4"
      >
        <dataset-metadata-form v-model="datasetEditFetch.data.value" />
      </v-col>
    </v-row>

    <df-navigation-right>
      <v-list
        v-if="datasetEditFetch.hasDiff.value"
        bg-color="background"
      >
        <v-list-item>
          <v-btn
            width="100%"
            color="accent"
            :loading="datasetEditFetch.save.loading.value"
            @click="datasetEditFetch.save.execute()"
          >
            {{ t('save') }}
          </v-btn>
        </v-list-item>
        <v-list-item>
          <confirm-menu
            :label="t('cancel')"
            :text="t('confirmCancelText')"
            :icon="mdiCancel"
            yes-color="warning"
            :btn-props="{ width: '100%', color: 'warning', variant: 'tonal' }"
            @confirm="cancelChanges"
          />
        </v-list-item>
        <v-list-item v-if="showAgentChat">
          <df-agent-chat-action
            action-id="summarize-metadata-changes"
            :visible-prompt="t('summarizeChanges')"
            :hidden-context="summarizeChangesContext"
            :btn-props="{ width: '100%', variant: 'tonal', density: 'default', icon: null, prependIcon: mdiRobotOutline, size: 'default', text: t('summarizeChanges') } as any"
            :title="t('summarizeChanges')"
          />
        </v-list-item>
      </v-list>
    </df-navigation-right>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  editMetadata: Éditer les métadonnées
  info: Informations
  metadata: Métadonnées
  attachments: Pièces jointes
  save: Enregistrer
  saved: Les modifications ont été enregistrées
  cancel: Annuler
  confirmCancelText: Souhaitez-vous annuler vos modifications ?
  summarizeChanges: Résumer les modifications
en:
  datasets: Datasets
  editMetadata: Edit metadata
  info: Information
  metadata: Metadata
  attachments: Attachments
  save: Save
  saved: Changes were saved
  cancel: Cancel
  confirmCancelText: Do you want to discard your changes?
  summarizeChanges: Summarize changes
</i18n>

<script setup lang="ts">
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiCancel, mdiRobotOutline } from '@mdi/js'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useShowAgentChat } from '~/composables/agent/use-show-chat'
import { useAgentDatasetSummaryTools } from '~/composables/dataset/agent-summary-tools'
import { useAgentDatasetChangesSummaryTools } from '~/composables/dataset/agent-changes-summary-tools'
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t, locale } = useI18n()
const route = useRoute<'/dataset/[id]/edit-metadata'>()

// Provide dataset store for child components that need it (dataset-attachments, dataset-status)
const store = provideDatasetStore(route.params.id, true)
useDatasetWatch(store, ['info'])

// useEditFetch for the central editable dataset
const datasetEditFetch = useEditFetch<any>(`${$apiPath}/datasets/${route.params.id}`, {
  query: { draft: true },
  patch: true,
  saveOptions: {
    success: t('saved')
  }
})
useLeaveGuard(datasetEditFetch.hasDiff, { locale })

useAgentDatasetSummaryTools(locale, datasetEditFetch.data, (s) => {
  if (datasetEditFetch.data.value) datasetEditFetch.data.value.summary = s
})
useAgentDatasetChangesSummaryTools(locale, datasetEditFetch.data, datasetEditFetch.serverData)

const breadcrumbs = useBreadcrumbs()
const showAgentChat = useShowAgentChat()

const cancelChanges = () => {
  if (datasetEditFetch.serverData.value) {
    datasetEditFetch.data.value = JSON.parse(JSON.stringify(datasetEditFetch.serverData.value))
  }
}

const summarizeChangesContext = 'Use the dataset_changes_summarizer subagent to read and summarize the changes made to the dataset metadata.'

watch(datasetEditFetch.data, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('editMetadata') }
    ]
  })
}, { immediate: true })
</script>

<style>
</style>
