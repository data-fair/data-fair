<template>
  <!-- a row of the list mode of the datasets page; selectors and sub-lists use the compact dataset-list-item -->
  <v-list-item
    :to="`/dataset/${dataset.id}`"
    lines="two"
    class="py-2 dataset-list-row"
  >
    <template #prepend>
      <v-icon
        :icon="typeIcon"
        :title="typeLabel"
        color="primary"
        class="mr-1"
      />
    </template>

    <v-list-item-title
      class="font-weight-bold"
      :title="dataset.title || dataset.id"
    >
      {{ dataset.title || dataset.id }}
    </v-list-item-title>
    <v-list-item-subtitle class="d-flex align-center flex-wrap ga-1 opacity-100">
      <template
        v-for="(part, i) in metaParts"
        :key="i"
      >
        <span v-if="i > 0">·</span>
        <span
          class="d-inline-flex align-center ga-1"
          :class="part.color && `text-${part.color}`"
        >
          <v-icon
            v-if="part.icon"
            :icon="part.icon"
            size="14"
          />
          {{ part.text }}
        </span>
      </template>
    </v-list-item-subtitle>

    <!-- columns of fixed width, aligned from one row to the next -->
    <template #append>
      <div class="d-none d-md-flex align-center ga-4">
        <div
          class="d-flex align-center justify-end ga-1"
          style="width: 240px"
        >
          <topic-chip
            v-for="topic in shownTopics"
            :key="topic.id ?? topic.title"
            :topic="topic"
          />
          <span
            v-if="hiddenTopics.length"
            :title="hiddenTopics.map(topic => topic.title).join(', ')"
            class="text-label-medium"
          >+{{ hiddenTopics.length }}</span>
        </div>
        <div
          class="d-flex align-center ga-1 text-body-small"
          style="width: 56px"
        >
          <template v-if="dataset.completeness">
            <v-progress-circular
              :model-value="dataset.completeness.score"
              :color="dataset.completeness.score >= 75 ? 'success' : dataset.completeness.score >= 50 ? 'warning' : 'error'"
              :title="t('completeness', { score: dataset.completeness.score })"
              size="16"
              width="3"
              style="transform: scaleX(-1)"
            />
            {{ dataset.completeness.score }}&nbsp;%
          </template>
        </div>
        <!-- same hover card as the resource cards; a fragment keeps the puzzle icon naming its parent -->
        <div
          class="d-flex justify-center"
          style="width: 32px"
        >
          <resource-visibility
            v-if="dataset.partOf"
            :visibility="dataset.visibility"
            :part-of="dataset.partOf"
            size="small"
          />
          <card-visibility
            v-else-if="dataset.visibility"
            :visibility="dataset.visibility"
          />
        </div>
        <div style="min-width: 28px">
          <owner-avatar
            v-if="showOwner"
            :owner="dataset.owner"
            :omit-owner-name="!showAll"
          />
        </div>
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import type { Dataset } from '#api/types'
import truncateMiddle from 'truncate-middle'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'
import {
  mdiAlert,
  mdiAllInclusive,
  mdiFile,
  mdiInformationOutline,
  mdiPictureInPictureBottomRightOutline,
  mdiProgressWrench,
  mdiShieldAlert
} from '@mdi/js'

const { t, locale } = useI18n()
const session = useSession()
const showAll = useBooleanSearchParam('showAll')

const { dataset } = defineProps<{ dataset: Dataset }>()

// same icons and labels as the dataset card
const typeIcon = computed(() => dataset.isVirtual
  ? mdiPictureInPictureBottomRightOutline
  : dataset.isRest ? mdiAllInclusive : dataset.isMetaOnly ? mdiInformationOutline : mdiFile)
const typeLabel = computed(() => t(dataset.isVirtual ? 'virtual' : dataset.isRest ? 'editable' : dataset.isMetaOnly ? 'metaOnly' : 'file'))

// same rule as the card: the department avatar when the list mixes departments
const showOwner = computed(() => showAll.value || !!(dataset.owner?.department && !session.state.account?.department))

const shownTopics = computed(() => dataset.topics?.slice(0, 2) ?? [])
const hiddenTopics = computed(() => dataset.topics?.slice(2) ?? [])

const metaParts = computed(() => {
  const parts: { icon?: string, text: string, color?: string }[] = []
  if (dataset.status === 'draft') parts.push({ icon: mdiProgressWrench, text: t('draft'), color: 'warning' })
  if (dataset.status === 'error') parts.push({ icon: mdiAlert, text: t('error'), color: 'error' })
  if (dataset.integrity?.lastCheck?.status === 'breach') parts.push({ icon: mdiShieldAlert, text: t('integrityBreach'), color: 'error' })
  const file = dataset.originalFile || dataset.file || dataset.draft?.originalFile || dataset.draft?.file
  if (file) parts.push({ text: truncateMiddle(file.name, 40, 6, '...') + (file.size ? ` (${formatBytes(file.size)})` : '') })
  else parts.push({ text: typeLabel.value })
  if (dataset.count != null) parts.push({ text: t('lines', { count: dataset.count.toLocaleString(locale.value) }, dataset.count) })
  if (dataset.updatedAt) parts.push({ text: t('updatedAt', { date: new Date(dataset.updatedAt).toLocaleDateString(locale.value) }) })
  return parts
})
</script>

<i18n lang="yaml">
fr:
  file: Fichier
  virtual: Virtuel
  editable: Éditable
  metaOnly: Métadonnées
  draft: Brouillon
  error: En erreur
  integrityBreach: Intégrité compromise
  lines: "0 ligne | 1 ligne | {count} lignes"
  updatedAt: Modifié le {date}
  completeness: 'Score de complétion des métadonnées : {score} %'
en:
  file: File
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft
  error: Error status
  integrityBreach: Integrity breach
  lines: "0 line | 1 line | {count} lines"
  updatedAt: Updated on {date}
  completeness: 'Metadata completeness score: {score} %'
</i18n>
