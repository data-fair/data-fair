<template>
  <v-card
    :to="`/dataset/${dataset.id}`"
    class="h-100 d-flex flex-column"
  >
    <v-card-item class="text-primary">
      <template #title>
        <span class="font-weight-bold">{{ dataset.title || dataset.id }}</span>
      </template>
      <template #append>
        <owner-avatar
          v-if="showOwner && dataset.owner"
          :owner="dataset.owner"
        />
      </template>
    </v-card-item>
    <v-divider />
    <v-card-text class="pa-0 flex-grow-1">
      <v-list
        density="compact"
        style="background-color: inherit;"
      >
        <!-- Type -->
        <v-list-item v-if="fileInfo">
          <template #prepend>
            <v-icon :icon="mdiFile" />
          </template>
          {{ fileInfo }}
        </v-list-item>
        <v-list-item v-if="dataset.isVirtual">
          <template #prepend>
            <v-icon
              :icon="mdiPictureInPictureBottomRightOutline"
              color="primary"
            />
          </template>
          {{ t('virtual') }}
        </v-list-item>
        <v-list-item v-if="dataset.isRest">
          <template #prepend>
            <v-icon
              :icon="mdiAllInclusive"
              color="primary"
            />
          </template>
          {{ t('editable') }}
        </v-list-item>
        <v-list-item v-if="dataset.isMetaOnly">
          <template #prepend>
            <v-icon
              :icon="mdiInformationOutline"
              color="primary"
            />
          </template>
          {{ t('metaOnly') }}
        </v-list-item>

        <!-- Status -->
        <v-list-item v-if="dataset.status === 'draft'">
          <template #prepend>
            <v-icon
              :icon="mdiProgressWrench"
              color="warning"
            />
          </template>
          {{ t('draft') }}
        </v-list-item>
        <v-list-item v-if="dataset.status === 'error'">
          <template #prepend>
            <v-icon
              :icon="mdiAlert"
              color="error"
            />
          </template>
          {{ t('error') }}
        </v-list-item>

        <!-- Record count -->
        <v-list-item v-if="dataset.count != null">
          <template #prepend>
            <v-icon :icon="mdiViewHeadline" />
          </template>
          {{ t('records', { count: dataset.count.toLocaleString() }, dataset.count) }}
        </v-list-item>

        <!-- Visibility -->
        <v-list-item v-if="dataset.visibility === 'public'">
          <template #prepend>
            <v-icon
              :icon="mdiLockOpen"
              color="primary"
            />
          </template>
          {{ t('public') }}
        </v-list-item>
        <v-list-item v-else-if="dataset.visibility">
          <template #prepend>
            <v-icon
              :icon="mdiLock"
              color="warning"
            />
          </template>
          {{ t('private') }}
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-card-subtitle class="text-body-small pb-3">
      <div
        v-if="showTopics && dataset.topics?.length"
        class="d-flex flex-wrap ga-1 mb-1"
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
      <span v-if="dataset.updatedAt">{{ t('updatedAt', { date: formatDate(dataset.updatedAt) }) }}</span>
    </v-card-subtitle>
  </v-card>
</template>

<script setup lang="ts">
import type { Dataset } from '#api/types'
import truncateMiddle from 'truncate-middle'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'
import {
  mdiLockOpen,
  mdiLock,
  mdiPictureInPictureBottomRightOutline,
  mdiAllInclusive,
  mdiInformationOutline,
  mdiProgressWrench,
  mdiAlert,
  mdiFile,
  mdiViewHeadline,
} from '@mdi/js'

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

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  public: Public
  private: Privé
  virtual: Virtuel
  editable: Éditable
  metaOnly: Métadonnées
  draft: Brouillon
  error: Erreur
  records: "0 enregistrement | 1 enregistrement | {count} enregistrements"
  updatedAt: Mis à jour le {date}
en:
  public: Public
  private: Private
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft
  error: Error
  records: "0 record | 1 record | {count} records"
  updatedAt: Updated on {date}
</i18n>
