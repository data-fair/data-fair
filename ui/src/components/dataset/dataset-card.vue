<template>
  <v-card
    :to="`/dataset/${dataset.id}`"
    class="w-100 h-100 d-flex flex-column"
  >
    <v-card-title class="text-body-large font-weight-bold text-truncate">
      {{ dataset.title || dataset.id }}
    </v-card-title>
    <v-card-text class="flex-grow-1">
      <!-- Type badges -->
      <div class="d-flex flex-wrap ga-1 mb-2">
        <v-chip
          v-if="dataset.isVirtual"
          size="x-small"
          color="primary"
          variant="tonal"
        >
          {{ t('virtual') }}
        </v-chip>
        <v-chip
          v-if="dataset.isRest"
          size="x-small"
          color="primary"
          variant="tonal"
        >
          {{ t('editable') }}
        </v-chip>
        <v-chip
          v-if="dataset.isMetaOnly"
          size="x-small"
          color="primary"
          variant="tonal"
        >
          {{ t('metaOnly') }}
        </v-chip>
        <v-chip
          v-if="dataset.status === 'draft'"
          size="x-small"
          color="warning"
          variant="tonal"
        >
          {{ t('draft') }}
        </v-chip>
        <v-chip
          v-if="dataset.status === 'error'"
          size="x-small"
          color="error"
          variant="tonal"
        >
          {{ t('error') }}
        </v-chip>
      </div>
      <div
        v-if="fileInfo"
        class="text-body-medium text-medium-emphasis mb-1"
      >
        {{ fileInfo }}
      </div>
      <div
        v-if="dataset.count != null"
        class="text-body-medium text-medium-emphasis mb-1"
      >
        {{ t('records', { count: dataset.count.toLocaleString() }, dataset.count) }}
      </div>
      <div
        v-if="showTopics && dataset.topics?.length"
        class="d-flex flex-wrap ga-1 mt-1"
      >
        <v-chip
          v-for="topic in dataset.topics"
          :key="topic.id"
          size="x-small"
          :style="topic.color ? { backgroundColor: topic.color, color: '#fff' } : {}"
          variant="flat"
        >
          {{ topic.title }}
        </v-chip>
      </div>
    </v-card-text>
    <v-card-subtitle class="text-body-small pb-3 d-flex align-center">
      <span
        v-if="dataset.visibility"
        class="mr-2 d-inline-flex"
      >
        <resource-visibility
          :visibility="dataset.visibility"
          size="small"
        />
      </span>
      <span v-if="showOwner && dataset.owner">{{ ownerName }} · </span>
      <span v-if="dataset.updatedAt">{{ t('updatedAt', { date: formatDate(dataset.updatedAt) }) }}</span>
    </v-card-subtitle>
  </v-card>
</template>

<script lang="ts" setup>
import type { Dataset } from '#api/types'
import truncateMiddle from 'truncate-middle'

const { t, locale } = useI18n()

const props = withDefaults(defineProps<{
  dataset: Dataset
  showTopics?: boolean
  showOwner?: boolean
}>(), {
  showTopics: true,
  showOwner: false,
})

const fileInfo = computed(() => {
  const file = props.dataset.originalFile || props.dataset.file ||
    props.dataset.draft?.originalFile || props.dataset.draft?.file
  if (!file) return null
  let info = truncateMiddle(file.name, 26, 4, '...')
  if (file.size) {
    info += ` (${formatBytes(file.size)})`
  }
  return info
})

const ownerName = computed(() => {
  const o = props.dataset.owner
  if (!o) return ''
  return o.departmentName || o.name || o.id
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  virtual: Virtuel
  editable: Éditable
  metaOnly: Métadonnées
  draft: Brouillon
  error: Erreur
  records: "0 enregistrement | 1 enregistrement | {count} enregistrements"
  updatedAt: Mis à jour le {date}
en:
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft
  error: Error
  records: "0 record | 1 record | {count} records"
  updatedAt: Updated on {date}
</i18n>
