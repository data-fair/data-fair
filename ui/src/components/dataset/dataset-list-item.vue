<template>
  <v-list-item
    :to="`/dataset/${dataset.id}`"
    lines="two"
  >
    <template
      v-if="dataset.visibility"
      #prepend
    >
      <resource-visibility
        :visibility="dataset.visibility"
        class="mr-2"
        size="small"
      />
    </template>
    <v-list-item-title :title="dataset.title || dataset.id">
      {{ dataset.title || dataset.id }}
      <v-chip
        v-if="dataset.status === 'error'"
        size="x-small"
        color="error"
        variant="tonal"
        class="ml-1"
      >
        {{ t('error') }}
      </v-chip>
    </v-list-item-title>
    <v-list-item-subtitle>
      <span v-if="showOwner && dataset.owner">{{ ownerName }} · </span>
      <span v-if="dataset.isVirtual">{{ t('virtual') }} · </span>
      <span v-if="dataset.isRest">{{ t('editable') }} · </span>
      <span v-if="dataset.isMetaOnly">{{ t('metaOnly') }} · </span>
      <span v-if="dataset.status === 'draft'">{{ t('draft') }} · </span>
      <span v-if="fileInfo">{{ fileInfo }} · </span>
      <span v-if="dataset.count != null">{{ dataset.count.toLocaleString() }} {{ t('lines') }} · </span>
      <span v-if="dataset.updatedAt">{{ formatDate(dataset.updatedAt) }}</span>
    </v-list-item-subtitle>
    <template
      v-if="showTopics && dataset.topics?.length"
      #append
    >
      <div class="d-flex ga-1">
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
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import type { Dataset } from '#api/types'

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
  let info = file.name
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
  lines: lignes
en:
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft
  error: Error
  lines: lines
</i18n>
