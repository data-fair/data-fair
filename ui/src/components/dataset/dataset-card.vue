<template>
  <v-card
    :to="noLink ? undefined : `/dataset/${dataset.id}`"
    class="h-100 d-flex flex-column"
  >
    <v-card-item class="text-primary">
      <template #title>
        <span
          class="font-weight-bold"
          :title="dataset.title || dataset.id"
        >{{ dataset.title || dataset.id }}</span>
      </template>
      <template #append>
        <owner-avatar
          v-if="showAll || !!(dataset.owner?.department && !session.state.account?.department)"
          :owner="dataset.owner"
          :omit-owner-name="!showAll"
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
      </v-list>
    </v-card-text>

    <!--
      min-height: auto => remove default v-card-actions min-height
    -->
    <v-card-actions
      class="flex-column align-start text-body-small py-2"
      style="min-height: auto"
    >
      <!-- Topics list -->
      <topic-chips :topics="dataset.topics" />

      <!-- Visibility + Updated at -->
      <div class="d-flex align-center flex-wrap">
        <resource-visibility
          v-if="dataset.visibility"
          :visibility="dataset.visibility"
          size="small"
        />
        <span
          v-if="dataset.updatedAt"
          class="ml-2"
        >
          {{ t('updatedAt', { date: formatDate(dataset.updatedAt) }) }}
        </span>
      </div>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import type { Dataset } from '#api/types'
import truncateMiddle from 'truncate-middle'
import ownerAvatar from '@data-fair/lib-vuetify/owner-avatar.vue'

import {
  mdiPictureInPictureBottomRightOutline,
  mdiAllInclusive,
  mdiInformationOutline,
  mdiProgressWrench,
  mdiAlert,
  mdiFile,
  mdiViewHeadline,
} from '@mdi/js'

const { t, locale } = useI18n()
const session = useSession()
const showAll = useBooleanSearchParam('showAll')

const props = withDefaults(defineProps<{
  dataset: Dataset
  noLink?: boolean
}>(), {
  noLink: false
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
