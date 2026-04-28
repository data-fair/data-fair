<template>
  <v-data-table-virtual
    v-if="dataset?.schema"
    :group-by="dataset.schema.some(f => 'x-group' in f) ? [{ key: 'x-group' }] : []"
    :headers="headers"
    :items="visibleFields"
    :height="tableHeight"
    density="comfortable"
    hide-default-footer
    fixed-header
  >
    <template #top>
      <div
        ref="topRef"
        class="d-flex justify-end"
      >
        <dataset-schema-download />
      </div>
    </template>
    <template #header.data-table-group>
      {{ t('group') }}
    </template>
    <template #item.title="{ item }">
      {{ item.title || item['x-originalName'] || item.key }}
    </template>
    <template #item.type="{ item }">
      <div>{{ propTypeTitle(item, locale) }}</div>
      <div
        v-if="item.format"
        class="text-caption text-medium-emphasis"
      >
        {{ item.format }}
      </div>
    </template>
    <template #item.values="{ item }">
      <template v-if="hasValues(item)">
        <v-chip
          v-for="(chip, i) in chipsFor(item)"
          :key="i"
          :title="chip.tooltip"
          size="x-small"
          variant="tonal"
          class="mr-1 my-1"
        >
          {{ chip.text }}
        </v-chip>
      </template>
    </template>
    <template #item.x-refersTo="{ item }">
      {{ vocabulary && item['x-refersTo'] && vocabulary[item['x-refersTo']]?.title }}
    </template>
    <template #item.description="{ item }">
      <div v-safe-html="item.description || (vocabulary && item['x-refersTo'] && vocabulary[item['x-refersTo']]?.description)" />
    </template>
    <template #item.actions="{ item }">
      <v-btn
        :icon="mdiInformationOutline"
        :title="t('details')"
        size="small"
        variant="text"
        @click="selectedField = item"
      />
    </template>
  </v-data-table-virtual>
  <dataset-schema-field-details
    :field="selectedField"
    @close="selectedField = null"
  />
</template>

<i18n lang="yaml">
fr:
  group: Groupe
  key: Clé
  title: Libellé
  type: Type
  values: Valeurs
  x-refersTo: Concept
  description: Description
  details: Détails du champ
  moreCount: "+{n} autres"
en:
  group: Group
  key: Key
  title: Title
  type: Type
  values: Values
  x-refersTo: Concept
  description: Description
  details: Field details
  moreCount: "+{n} more"
</i18n>

<script setup lang="ts">
import { mdiInformationOutline } from '@mdi/js'
import { useElementSize } from '@vueuse/core'
import { propTypeTitle } from '~/utils/dataset'
import type { SchemaProperty } from '#api/types'

const { t, locale } = useI18n()
const { vocabulary } = useStore()
const { dataset } = useDatasetStore()

const props = defineProps<{ height?: number }>()

const topRef = ref<HTMLElement | null>(null)
const { height: topHeight } = useElementSize(topRef)
const tableHeight = computed(() => props.height ? props.height - topHeight.value : undefined)

const headers = computed(() => [
  { key: 'key', title: t('key'), minWidth: '160px' },
  { key: 'title', title: t('title'), minWidth: '160px' },
  { key: 'type', title: t('type'), minWidth: '120px' },
  { key: 'values', title: t('values'), minWidth: '180px', sortable: false },
  { key: 'x-refersTo', title: t('x-refersTo'), minWidth: '140px' },
  { key: 'description', title: t('description'), minWidth: '240px' },
  { key: 'actions', title: '', sortable: false, width: '56px', align: 'center' as const }
])

const visibleFields = computed(() => dataset.value?.schema?.filter(f => !f['x-calculated']) ?? [])

const selectedField = ref<SchemaProperty | null>(null)

const MAX_INLINE_CHIPS = 4

function hasValues (field: SchemaProperty) {
  const enumLen = Array.isArray(field.enum) ? field.enum.length : 0
  const labelsLen = field['x-labels'] ? Object.keys(field['x-labels']).length : 0
  return enumLen + labelsLen > 0
}

function chipsFor (field: SchemaProperty) {
  const labels = (field['x-labels'] || {}) as Record<string, string>
  const fromEnum = Array.isArray(field.enum) ? field.enum.map(v => String(v)) : []
  const fromLabels = Object.keys(labels)
  const values = Array.from(new Set([...fromEnum, ...fromLabels]))
  const head = values.slice(0, MAX_INLINE_CHIPS).map(value => {
    const label = labels[value]
    return label
      ? { text: label, tooltip: value }
      : { text: value, tooltip: value }
  })
  if (values.length > MAX_INLINE_CHIPS) {
    const rest = values.slice(MAX_INLINE_CHIPS)
    head.push({
      text: t('moreCount', { n: rest.length }),
      tooltip: rest.map(v => labels[v] ? `${labels[v]} (${v})` : v).join(', ')
    })
  }
  return head
}
</script>
