<template>
  <v-container
    v-if="dataset && dataset.isRest"
    class="pa-0"
    fluid
  >
    <div class="d-flex justify-end pa-2">
      <df-agent-chat-action
        action-id="help-edit-data"
        :visible-prompt="t('helpEditDataPrompt')"
        :hidden-context="dataEntryContext"
        :title="t('helpEditDataPrompt')"
      />
    </div>
    <dataset-table
      :height="contentHeight - 52"
      :edit="true"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  editData: Éditer les données
  helpEditDataPrompt: Aide-moi à saisir des données
en:
  datasets: Datasets
  editData: Edit data
  helpEditDataPrompt: Help me enter data
</i18n>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { useLayout } from 'vuetify'
import { provideDatasetStore } from '~/composables/dataset/dataset-store'
import { useDatasetWatch } from '~/composables/dataset/watch'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { DfAgentChatAction } from '@data-fair/lib-vuetify-agents'

const { t } = useI18n()
const route = useRoute<'/dataset/[id]/edit-data'>()
const { height: windowHeight } = useWindowSize()
const { mainRect } = useLayout()
const breadcrumbs = useBreadcrumbs()

const store = provideDatasetStore(route.params.id, undefined, true)
const { dataset } = store

useDatasetWatch(store, ['info'])

const contentHeight = computed(() => windowHeight.value - mainRect.value.top - mainRect.value.bottom)

const dataEntryContext = computed(() => {
  const d = dataset.value
  if (!d) return ''
  const lines = [
    `The user is on the data editing page for REST dataset "${d.title}" (id: ${d.id}).`,
    'You can help them add or edit data lines.',
    'To add a new line: use the open_add_line_dialog tool, then delegate to the editLine_form subagent to fill form fields (it becomes available once the dialog opens).',
    'To edit an existing line: first delegate to the dataset_data subagent to search for the line _id, then use open_edit_line_dialog with that _id, then delegate to the editLine_form subagent to modify fields.',
    'IMPORTANT: Do NOT submit the form. The user will click Save manually.',
    'Start by asking the user what they want to do.'
  ]
  if (d.schema?.length) {
    lines.push(`Dataset columns: ${d.schema.filter((f: any) => !f['x-calculated']).map((f: any) => `${f.key} (${f.title || f.key}, ${f.type})`).join(', ')}`)
  }
  return lines.join(' ')
})

watch(dataset, (d) => {
  if (!d) return
  breadcrumbs.receive({
    breadcrumbs: [
      { text: t('datasets'), to: '/datasets' },
      { text: d.title || d.id, to: `/dataset/${d.id}` },
      { text: t('editData') }
    ]
  })
}, { immediate: true })
</script>
