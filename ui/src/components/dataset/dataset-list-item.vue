<template>
  <v-list-item
    :to="noLink ? undefined : `/dataset/${dataset.id}`"
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
      <v-tooltip
        v-if="dataset.status === 'error'"
        :text="t('error')"
      >
        <template #activator="{ props: tooltipProps }">
          <v-icon
            v-bind="tooltipProps"
            :icon="mdiAlert"
            color="error"
            size="small"
            class="ml-1"
          />
        </template>
      </v-tooltip>
    </v-list-item-title>
    <v-list-item-subtitle>
      <span v-if="dataset.isVirtual">{{ t('virtual') }} · </span>
      <span v-if="dataset.isRest">{{ t('editable') }} · </span>
      <span v-if="dataset.isMetaOnly">{{ t('metaOnly') }} · </span>
      <span v-if="dataset.status === 'draft'">{{ t('draft') }} · </span>
      <span v-if="fileInfo">{{ fileInfo }} · </span>
      <span v-if="dataset.count != null">{{ dataset.count.toLocaleString() }} {{ t('lines') }} · </span>
      <span v-if="dataset.updatedAt">{{ formatDate(dataset.updatedAt) }}</span>
    </v-list-item-subtitle>
    <template
      v-if="showAppend"
      #append
    >
      <div class="d-flex align-center ga-2">
        <topic-chips
          v-if="showTopics && dataset.topics?.length"
          :topics="dataset.topics"
        />
        <owner-avatar
          v-if="showOwner && dataset.owner"
          :owner="dataset.owner"
          :omit-owner-name="!showAll"
        />
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import type { Dataset } from '#api/types'
import { mdiAlert } from '@mdi/js'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'

const { t, locale } = useI18n()
const showAll = useBooleanSearchParam('showAll')

const props = withDefaults(defineProps<{
  dataset: Dataset
  showTopics?: boolean
  showOwner?: boolean
  noLink?: boolean
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

const showAppend = computed(() =>
  (props.showTopics && !!props.dataset.topics?.length) ||
  (props.showOwner && !!props.dataset.owner)
)

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
  error: En erreur
  lines: lignes
en:
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft
  error: Error status
  lines: lines
</i18n>
