<template>
  <v-container v-if="datasetEditFetch.data.value">
    <v-row class="dataset">
      <v-col>
          <df-section-tabs
            v-if="sections.info"
            id="info"
            v-model="infoTab"
            :min-height="300"
            :title="sections.info.title"
            :tabs="sections.info.tabs"
            :color="sections.info.color"
            :svg="infoSvg"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="info">
                  <v-container fluid>
                    <dataset-info v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
                <v-tabs-window-item value="metadata">
                  <v-container fluid>
                    <dataset-metadata-form v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
                <v-tabs-window-item
                  v-if="!datasetEditFetch.data.value?.draftReason"
                  value="attachments"
                >
                  <dataset-attachments />
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </df-section-tabs>

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
      <df-toc :sections="tocSections" />
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
import infoSvg from '~/assets/svg/Creative Process_Two Color.svg?raw'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import { mdiAlert, mdiAttachment, mdiCancel, mdiInformation, mdiRobotOutline, mdiTag } from '@mdi/js'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'
import { useShowAgentChat } from '~/composables/agent/use-show-chat'
import { useAgentDatasetSummaryTools } from '~/composables/dataset/agent-summary-tools'
import { useAgentDatasetChangesSummaryTools } from '~/composables/dataset/agent-changes-summary-tools'
import { provideDatasetStore } from '~/composables/dataset/store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import equal from 'fast-deep-equal'

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
const infoTab = ref('info')

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

// Diff detection per section
const infoHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return d.title !== s.title ||
    d.description !== s.description ||
    d.summary !== s.summary ||
    d.slug !== s.slug ||
    !equal(d.rest, s.rest)
})

const metadataHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.license, s.license) ||
    !equal(d.topics, s.topics) ||
    !equal(d.keywords, s.keywords) ||
    d.origin !== s.origin ||
    d.image !== s.image ||
    d.creator !== s.creator ||
    d.frequency !== s.frequency ||
    d.spatial !== s.spatial ||
    !equal(d.temporal, s.temporal) ||
    d.modified !== s.modified ||
    d.projection !== s.projection ||
    d.attachmentsAsImage !== s.attachmentsAsImage ||
    !equal(d.customMetadata, s.customMetadata)
})

const sections = computedDeepDiff(() => {
  const d = datasetEditFetch.data.value
  if (!d) return {} as Record<string, { title: string, color?: string, tabs: any[] }>

  const infoOrMetaDiff = infoHasDiff.value || metadataHasDiff.value

  const infoTabs: any[] = [
    {
      key: 'info',
      title: t('info'),
      icon: mdiInformation,
      appendIcon: infoHasDiff.value ? mdiAlert : undefined,
      color: infoHasDiff.value ? 'accent' : undefined
    },
    {
      key: 'metadata',
      title: t('metadata'),
      icon: mdiTag,
      appendIcon: metadataHasDiff.value ? mdiAlert : undefined,
      color: metadataHasDiff.value ? 'accent' : undefined
    }
  ]
  if (!d.draftReason) {
    infoTabs.push({ key: 'attachments', title: t('attachments'), icon: mdiAttachment })
  }

  return {
    info: {
      title: t('info'),
      color: infoOrMetaDiff ? 'accent' : undefined,
      tabs: infoTabs
    }
  } as Record<string, { title: string, color?: string, tabs: any[] }>
})

const tocSections = computed(() => Object.entries(sections.value).map(([id, s]) => ({ id, title: s.title })))
</script>

<style>
</style>
