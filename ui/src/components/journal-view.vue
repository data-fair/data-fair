<template>
  <v-list
    v-if="taskProgress"
    bg-color="rgb(0,0,0,0)"
  >
    <dataset-task-progress :task-progress="taskProgress" />
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
      <!-- an error carries its message in place of the event label, the other types keep both -->
      <journal-message
        v-if="event.type === 'error' && event.data"
        :data="event.data"
        class="text-error"
        :color="getEventType(event).color || undefined"
      />
      <v-list-item-title v-else>
        {{ eventLabel(event) }}
        {{ event.type === 'draft-validated' ? `(${event.data})` : '' }}
      </v-list-item-title>
      <journal-message
        v-if="event.data && !['draft-validated', 'error'].includes(event.type)"
        subtitle
        :data="event.data"
        :class="{ 'text-error': event.type === 'validation-error' }"
        :color="getEventType(event).color || undefined"
      />
      <template #append>
        <div class="d-flex flex-column align-end">
          <span class="text-body-small default text-no-wrap">
            {{ event.date ? dayjs(event.date).format('lll') : dayjs().format('lll') }}
          </span>
          <v-btn
            v-if="(event as any).hasDiagnosticFile && diagnosticDownloadHref(event)"
            variant="text"
            size="small"
            color="error"
            :prepend-icon="mdiFileDownload"
            :href="diagnosticDownloadHref(event)"
            target="_blank"
          >
            {{ t('downloadDiagnostic') }}
          </v-btn>
        </div>
      </template>
    </v-list-item>
  </v-list>
  <div
    v-if="visibleCount < filteredEvents.length"
    class="text-center my-2"
  >
    <v-btn
      variant="text"
      @click="visibleCount += 100"
    >
      {{ t('showMore') }}
    </v-btn>
  </div>
</template>

<i18n lang="yaml">
fr:
  draft: Brouillon
  downloadDiagnostic: Télécharger le diagnostic
  showMore: Voir plus
en:
  draft: Draft
  downloadDiagnostic: Download diagnostic
  showMore: Show more
</i18n>

<script setup lang="ts">
import { inject } from 'vue'
import type { Event } from '#api/types'
import eventsJson from '#shared/events.json'
import { mdiAlert, mdiAlertDecagram, mdiCheck, mdiClipboardText, mdiContentSave, mdiDelete, mdiFileCancel, mdiFileCheck, mdiFileDownload, mdiFileSearch, mdiFileSwap, mdiMerge, mdiPencil, mdiPlusCircleOutline, mdiPublish, mdiReloadAlert, mdiTableOfContents, mdiWrench } from '@mdi/js'
import { datasetStoreKey, type DatasetStore, type TaskProgress } from '~/composables/dataset/dataset-store'
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

// dataset store may not be provided when type === 'application' — that's fine,
// the diagnostic button only renders when we can build a URL.
const datasetStore = inject<DatasetStore | undefined>(datasetStoreKey, undefined)
const diagnosticDownloadHref = (event: Event) => {
  if (type !== 'dataset' || !datasetStore) return undefined
  // an auto-cancelled contribution stores its diagnostic in a distinct slot on the
  // main dataset (the draft is gone), served by a dedicated route, no ?draft
  if (event.type === 'draft-cancelled') {
    return `${datasetStore.resourceUrl.value}/cancelled-draft-diagnostic.csv`
  }
  const qs = event.draft ? '?draft=true' : ''
  return `${datasetStore.resourceUrl.value}/validation-diagnostic.csv${qs}`
}

const eventTypes = eventsList[type]
const draftEventTypes = eventsList[`${type}-draft`]

const filteredEvents = computed(() => journal.filter(event => !!eventTypes[event.type] && (!after || event.date >= after)))

const visibleCount = ref(10)

const groupedEvents = computed(() => {
  const groups = []
  let currentGroup: { draft: boolean, events: Event[] } = { draft: false, events: [] }

  for (const event of filteredEvents.value.slice(0, visibleCount.value)) {
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

<style scoped>
/* override vuetify's single-line ellipsis: journal messages may be long and must stay readable */
:deep(.v-list-item-title),
:deep(.v-list-item-subtitle) {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}
/* vuetify's 1rem subtitle line-height is meant for a single line: too tight for a message
   spread over several lines, and its sub-pixel overflow shows a scrollbar for nothing */
:deep(.v-list-item-subtitle) {
  line-height: 1.25rem;
}
/* align the event icon and the date with the first line of the message rather than with
   the middle of the item */
:deep(.v-list-item__prepend),
:deep(.v-list-item__append) {
  align-self: flex-start;
}
/* keep the date off the message it sits next to */
:deep(.v-list-item__append) {
  padding-inline-start: 16px;
}
</style>
