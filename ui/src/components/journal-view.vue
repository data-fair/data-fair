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
      :lines="isLongMessage(event) ? 'three' : undefined"
    >
      <v-list-item-title>
        <span
          v-if="event.type === 'error'"
          class="text-error journal-message"
          :class="{ 'journal-message-expanded': expanded[eventKey(event)] }"
        >
          {{ event.data || eventLabel(event) }}
        </span>
        <span
          v-else
          class="journal-message"
        >
          {{ eventLabel(event) }}
          {{ event.type === 'draft-validated' ? `(${event.data})` : '' }}
        </span>
      </v-list-item-title>
      <v-list-item-subtitle v-if="event.type === 'validation-error' && event.data">
        <p
          class="text-error journal-message"
          :class="{ 'journal-message-expanded': expanded[eventKey(event)] }"
        >
          {{ event.data }}
        </p>
      </v-list-item-subtitle>
      <v-list-item-subtitle v-else-if="event.data && !['draft-validated', 'error'].includes(event.type)">
        <p
          v-safe-html="event.data"
          class="journal-message"
          :class="{ 'journal-message-expanded': expanded[eventKey(event)] }"
        />
      </v-list-item-subtitle>
      <v-btn
        v-if="isLongMessage(event)"
        variant="text"
        size="small"
        :color="getEventType(event).color || undefined"
        :append-icon="expanded[eventKey(event)] ? mdiChevronUp : mdiChevronDown"
        @click="expanded[eventKey(event)] = !expanded[eventKey(event)]"
      >
        {{ expanded[eventKey(event)] ? t('collapseMessage') : t('expandMessage') }}
      </v-btn>
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
  expandMessage: Voir le message complet
  collapseMessage: Réduire le message
en:
  draft: Draft
  downloadDiagnostic: Download diagnostic
  showMore: Show more
  expandMessage: Show full message
  collapseMessage: Collapse message
</i18n>

<script setup lang="ts">
import { inject } from 'vue'
import type { Event } from '#api/types'
import eventsJson from '#shared/events.json'
import { mdiAlert, mdiAlertDecagram, mdiCheck, mdiChevronDown, mdiChevronUp, mdiClipboardText, mdiContentSave, mdiDelete, mdiFileCancel, mdiFileCheck, mdiFileDownload, mdiFileSearch, mdiFileSwap, mdiMerge, mdiPencil, mdiPlusCircleOutline, mdiPublish, mdiReloadAlert, mdiTableOfContents, mdiWrench } from '@mdi/js'
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

// long messages (a breaking-changes list, an ES error dump, the list of empty columns...)
// are clamped to 2 lines with a toggle to reveal the whole thing in a scrollable block.
// Event labels come from a fixed enum (128 chars max), only event.data is unbounded.
const expanded = ref<Record<string, boolean>>({})
const eventKey = (event: Event) => `${event.date}-${event.type}`
const isLongMessage = (event: Event) => {
  if (!event.data || event.type === 'draft-validated') return false
  return event.data.length > 140 || event.data.includes('\n')
}

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
.journal-message {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  white-space: pre-line;
}
.journal-message-expanded {
  -webkit-line-clamp: unset;
  line-clamp: unset;
  max-height: 300px;
  overflow-y: auto;
}
:deep(.v-list-item-title),
:deep(.v-list-item-subtitle) {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}
</style>
