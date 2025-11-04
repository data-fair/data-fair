<template>
  <v-list v-if="taskProgress">
    <v-list-item>
      <v-list-item-title>
        {{ t('activity') }} - {{ t('tasks.' + taskProgress.task) }}
      </v-list-item-title>
      <v-progress-linear
        :model-value="taskProgress.progress"
        :indeterminate="taskProgress.progress === -1"
        :color="taskProgress.error ? 'error' : 'primary'"
        class="mt-1"
      />
    </v-list-item>
  </v-list>
  <v-list
    v-for="(group, i) in groupedEvents"
    :key="i"
    :border="group.draft"
    :rounded="group.draft"
    :density="group.draft ? 'compact' : 'comfortable'"
    bg-color="rgb(0,0,0,0)"
  >
    <v-list-subheader v-if="group.draft">
      {{ t('draft') }}
    </v-list-subheader>
    <v-list-item
      v-for="(event,j) in group.events"
      :key="`${i}-${j}`"
      :prepend-icon="mdiIcons[getEventType(event).icon]"
      :base-color="getEventType(event).color || 'default'"
    >
      <v-list-item-title>
        <span
          v-if="event.type === 'error' || event.type === 'validation-error'"
          class="text-error"
        >
          {{ event.data || eventLabel(event) }}
        </span>
        <span v-else>
          {{ eventLabel(event) }}
          {{ event.type === 'draft-validated' ? `(${event.data})` : '' }}
        </span>
      </v-list-item-title>
      <v-list-item-subtitle v-if="event.data && !['draft-validated', 'error', 'validation-error'].includes(event.type)">
        <p v-safe-html="event.data" />
      </v-list-item-subtitle>
      <template #append>
        <span class="text-caption default">
          {{ event.date ? dayjs(event.date).format('lll') : dayjs().format('lll') }}
        </span>
      </template>
    </v-list-item>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  draft: Brouillon
  activity: Activité
  tasks:
    initialize: initialisation
    store: chargement
    index: indexation
    extend: extensions
    analyze: analyse
    validate: validation
    finalize: finalisation
    normalize: conversion
    download: téléchargement
en:
  draft: Draft
  activity: Activity
  tasks:
    initialize: initialization
    store: loading
    index: indexing
    extend: extensions
    analyze: analysis
    validate: validation
    finalize: finalization
    normalize: conversion
    download: download
</i18n>

<script lang="ts" setup>
import type { Event } from '#api/types'
import eventsJson from '#shared/events.json'
import { mdiAlert, mdiAlertDecagram, mdiCheck, mdiClipboardText, mdiContentSave, mdiDelete, mdiFileCancel, mdiFileCheck, mdiFileDownload, mdiFileSearch, mdiFileSwap, mdiMerge, mdiPencil, mdiPlusCircleOutline, mdiPublish, mdiReloadAlert, mdiTableOfContents, mdiWrench } from '@mdi/js'
import { type TaskProgress } from '~/composables/dataset-store'
const eventsList = eventsJson as Record<string, Record<string, { icon: string, text: Record<string, string>, color?: string }>>

const session = useSession()
const { dayjs } = useLocaleDayjs()
const { t } = useI18n()

const { journal, type, after } = defineProps<{
  journal: Event[]
  type: 'dataset' | 'application'
  after?: string
  taskProgress?: TaskProgress
}>()

const eventTypes = eventsList[type]
const draftEventTypes = eventsList[`${type}-draft`]

const groupedEvents = computed(() => {
  const groups = []
  let currentGroup: { draft: boolean, events: Event[] } = { draft: false, events: [] }
  const events = journal.filter(event => !!eventTypes[event.type])

  for (const event of events) {
    if (after && event.date < after) continue
    if (!!event.draft !== currentGroup.draft) {
      groups.push(currentGroup)
      currentGroup = { draft: !!event.draft, events: [] }
    }
    currentGroup.events.push(event)
  }
  if (currentGroup.events.length > 0) groups.push(currentGroup)
  return groups
})

const eventLabel = (item: Event) => {
  const eventType = getEventType(item)
  return eventType.text[session.lang.value] || eventType.text[session.lang.value]
}

const getEventType = (item: Event) => {
  return (item.draft && draftEventTypes?.[item.type]) ? draftEventTypes[item.type] : eventTypes[item.type]
}

const mdiIcons: Record<string, string> = {
  'mdi-alert': mdiAlert,
  'mdi-alert-decagram': mdiAlertDecagram,
  'mdi-check': mdiCheck,
  'mdi-clipboard-text': mdiClipboardText,
  'mdi-content-save': mdiContentSave,
  'mdi-delete': mdiDelete,
  'mdi-file-cancel': mdiFileCancel,
  'mdi-file-check': mdiFileCheck,
  'mdi-file-download': mdiFileDownload,
  'mdi-file-search': mdiFileSearch,
  'mdi-file-swap': mdiFileSwap,
  'mdi-merge': mdiMerge,
  'mdi-pencil': mdiPencil,
  'mdi-plus-circle-outline': mdiPlusCircleOutline,
  'mdi-publish': mdiPublish,
  'mdi-reload-alert': mdiReloadAlert,
  'mdi-table-of-contents': mdiTableOfContents,
  'mdi-wrench': mdiWrench,
}

</script>
