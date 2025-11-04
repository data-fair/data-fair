<template>
  <v-card
    variant="outlined"
    hover
    class="bg-surface"
  >
    <v-card-title>
      <span
        class="font-weight-bold text-primary"
        style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;"
      >
        {{ dataset.title || dataset.id }}
      </span>
    </v-card-title>
    <v-card-text
      style="min-height: 80px;"
      class="pa-0"
    >
      <v-list
        density="compact"
        class="py-0"
      >
        <v-list-item
          v-if="dataset.isVirtual"
          :prepend-icon="mdiPictureInPictureBottomRightOutline"
        >
          {{ t('virtual') }}
        </v-list-item>
        <v-list-item
          v-if="dataset.isRest"
          :prepend-icon="mdiAllInclusive"
        >
          {{ t('inc') }}
        </v-list-item>
        <v-list-item
          v-if="dataset.file"
          style="overflow: hidden;"
          :prepend-icon="mdiFile"
        >
          {{ truncateMiddle((dataset.originalFile || dataset.file).name, 40, 4, '...') }} {{ formatBytes(dataset.originalFile?.size || dataset.file?.size, locale) }}
        </v-list-item>
        <v-list-item
          v-else-if="dataset.draft?.file"
          style="overflow: hidden;"
          :prepend-icon="mdiFile"
        >
          {{ truncateMiddle((dataset.draft.originalFile || dataset.draft.file).name, 40, 4, '...') }} {{ formatBytes(dataset.draft.originalFile?.size || dataset.draft.file?.size, locale) }}
        </v-list-item>
        <v-list-item
          v-if="dataset.draft && !dataset.file"
          :prepend-icon="mdiProgressWrench"
        >
          {{ t('draft') }}
        </v-list-item>
        <v-list-item
          v-if="dataset.count !== undefined"
          :prepend-icon="mdiViewHeadline"
        >
          {{ t('lines', {}, dataset.count) }}
        </v-list-item>
      </v-list>
    </v-card-text>
    <v-row
      v-if="showTopics"
      style="min-height:30px;"
    >
      <v-col class="pt-2 pb-2">
        <v-chip
          v-for="topic of dataset.topics"
          :key="topic.id"
          size="small"
          variant="outlined"
          :color="topic.color || 'default'"
          class="ml-2"
          style="font-weight: bold"
        >
          {{ topic.title }}
        </v-chip>
      </v-col>
    </v-row>
    <v-card-actions class="pl-4">
      <template v-if="dataset.owner">
        <owner-short
          v-if="showOwner"
          :owner="dataset.owner as Account"
          :ignore-department="true"
        />
        <owner-department
          v-if="showOwner"
          :owner="dataset.owner as Account"
        />
      </template>
      <resource-visibility
        v-if="dataset.visibility"
        :visibility="dataset.visibility"
      />
      <v-tooltip
        v-if="dataset.status === 'error'"
        location="top"
      >
        <template #activator="{props}">
          <v-icon
            color="error"
            v-bind="props"
            :icon="mdiAlert"
          />
        </template>
        {{ $t('error') }}
      </v-tooltip>
      <v-spacer />
    </v-card-actions>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  virtual: Jeu de données virtuel
  inc: Jeu de données éditable
  lines: "aucune ligne | 1 ligne | {count} lignes"
  error: En erreur
  draft: brouillon
en:
  virtual: Virtual dataset
  inc: Editable dataset
  lines: "no line | 1 line | {count} lines"
  error: Error status
  draft: draft
</i18n>

<script lang="ts" setup>
import truncateMiddle from 'truncate-middle'
import { type DatasetExt } from '#api/types'
import { mdiAlert, mdiAllInclusive, mdiFile, mdiPictureInPictureBottomRightOutline, mdiProgressWrench, mdiViewHeadline } from '@mdi/js'
import formatBytes from '@data-fair/lib-vue/format/bytes'
import { Account } from '@data-fair/lib-vue/session'

const { showOwner } = defineProps({
  showOwner: { type: Boolean, default: false },
  showTopics: { type: Boolean, default: false },
  dataset: { type: Object as () => Partial<DatasetExt>, required: true }
})

const { t, locale } = useI18n()
</script>

<style lang="css" scoped>
</style>
