<template>
  <v-data-table-virtual
    v-if="dataset?.schema"
    :group-by="dataset.schema.some(f => 'x-group' in f) ? [{ key: 'x-group' }] : []"
    :headers="headers"
    :items="dataset.schema.filter(f => !f['x-calculated'])"
    density="comfortable"
    hide-default-footer
    fixed-header
  >
    <template #header.data-table-group>
      {{ t('group') }}
    </template>
    <template #item.title="{ item }">
      {{ item.title || item['x-originalName'] || item.key }}
    </template>
    <template #item.type="{ item }">
      {{ propTypeTitle(item) }}
    </template>
    <template #item.x-refersTo="{ item }">
      {{ vocabulary && item['x-refersTo'] && vocabulary[item['x-refersTo']]?.title }}
    </template>
    <template #item.description="{ item }">
      <p v-safe-html="item.description || (vocabulary && item['x-refersTo'] && vocabulary[item['x-refersTo']]?.description)" />
    </template>
  </v-data-table-virtual>
</template>

<i18n lang="yaml">
fr:
  group: Groupe
  key: Clé
  title: Libellé
  type: Type
  x-refersTo: Concept
  description: Description
en:
  group: Group
  key: Key
  title: Title
  type: Type
  x-refersTo: Concept
  description: Description
</i18n>

<script setup lang="ts">
import { propTypeTitle } from '~/utils/dataset'

const { t } = useI18n()
const { vocabulary } = useStore()
const { dataset } = useDatasetStore()

const headers = [
  { key: 'key', title: t('key') },
  { key: 'title', title: t('title') },
  { key: 'type', title: t('type') },
  { key: 'x-refersTo', title: t('x-refersTo') },
  { key: 'description', title: t('description') }
]

</script>
