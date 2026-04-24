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
    <v-list-item-subtitle v-if="subtitleParts.length">
      <template
        v-for="(part, i) in subtitleParts"
        :key="i"
      >
        <span v-if="i > 0"> · </span>
        <v-icon
          v-if="part.icon"
          :icon="part.icon"
          size="small"
          class="mr-1"
        />
        <span>{{ part.text }}</span>
      </template>
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
import {
  mdiAlert,
  mdiAllInclusive,
  mdiFile,
  mdiInformationVariant,
  mdiPictureInPictureBottomRightOutline,
  mdiProgressWrench
} from '@mdi/js'
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

const subtitleParts = computed(() => {
  const parts: { icon?: string, text: string }[] = []
  if (props.dataset.status === 'draft') parts.push({ icon: mdiProgressWrench, text: t('draft') })
  if (props.dataset.isVirtual) parts.push({ icon: mdiPictureInPictureBottomRightOutline, text: t('virtual') })
  if (props.dataset.isRest) parts.push({ icon: mdiAllInclusive, text: t('editable') })
  if (props.dataset.isMetaOnly) parts.push({ icon: mdiInformationVariant, text: t('metaOnly') })
  if (fileInfo.value) parts.push({ icon: mdiFile, text: fileInfo.value })
  if (props.dataset.count != null) parts.push({ text: `${props.dataset.count.toLocaleString()} ${t('lines')}` })
  if (props.dataset.updatedAt) parts.push({ text: formatDate(props.dataset.updatedAt) })
  return parts
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
