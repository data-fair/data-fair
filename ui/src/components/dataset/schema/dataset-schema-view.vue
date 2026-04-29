<template>
  <v-data-table-virtual
    v-if="dataset?.schema"
    :expanded="expanded"
    :group-by="dataset.schema.some(f => 'x-group' in f) ? [{ key: 'x-group' }] : []"
    :headers="headers"
    :items="visibleFields"
    :height="height"
    item-value="key"
    density="comfortable"
    hide-default-footer
    fixed-header
    show-expand
    class="bg-background"
    @update:expanded="onExpandedUpdate"
  >
    <template #header.data-table-group>
      {{ t('group') }}
    </template>
    <template #header.data-table-expand>
      <dataset-schema-download />
    </template>
    <template #item.title="{ item }">
      {{ item.title || item['x-originalName'] || item.key }}
    </template>
    <template #item.type="{ item }">
      {{ propTypeTitle(item, locale) }}
    </template>
    <template #item.description="{ item }">
      {{ descriptionFor(item) }}
    </template>
    <template #item.data-table-expand="{ internalItem, isExpanded, toggleExpand }">
      <v-btn
        :icon="isExpanded(internalItem) ? mdiClose : mdiInformationOutline"
        :title="isExpanded(internalItem) ? t('collapse') : t('moreInfo')"
        variant="text"
        size="small"
        @click="toggleExpand(internalItem)"
      />
    </template>
    <template #expanded-row="{ columns, item }">
      <tr>
        <td
          :colspan="columns.length"
          class="pa-0"
        >
          <dataset-schema-field-details :field="item" />
        </td>
      </tr>
    </template>
  </v-data-table-virtual>
</template>

<i18n lang="yaml">
fr:
  group: Groupe
  key: Clé
  title: Libellé
  type: Type
  description: Description
  moreInfo: Plus d'infos
  collapse: Réduire
en:
  group: Group
  key: Key
  title: Title
  type: Type
  description: Description
  moreInfo: More info
  collapse: Collapse
</i18n>

<script setup lang="ts">
import { mdiClose, mdiInformationOutline } from '@mdi/js'
import { propTypeTitle } from '~/utils/dataset'
import type { SchemaProperty } from '#api/types'

const { t, locale } = useI18n()
const { vocabulary } = useStore()
const { dataset } = useDatasetStore()

defineProps<{ height?: number }>()

const truncateStyle = 'max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap'
const headers = computed(() => [
  { key: 'key', title: t('key'), width: '160px' },
  { key: 'title', title: t('title'), width: '25%', cellProps: { style: truncateStyle } },
  { key: 'type', title: t('type'), width: '125px' },
  { key: 'description', title: t('description'), width: '40%', cellProps: { style: truncateStyle } },
  { key: 'data-table-expand', title: '', sortable: false, align: 'end' as const }
])

const visibleFields = computed(() => dataset.value?.schema?.filter(f => !f['x-calculated']) ?? [])

const expanded = ref<string[]>([])
function onExpandedUpdate (next: string[]) {
  const added = next.find(k => !expanded.value.includes(k))
  expanded.value = added ? [added] : []
}

function descriptionFor (field: SchemaProperty) {
  const refersTo = field['x-refersTo']
  const raw = field.description || (vocabulary.value && refersTo && vocabulary.value[refersTo]?.description) || ''
  return raw.replace(/<[^>]*>/g, '')
}
</script>
