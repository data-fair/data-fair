<!-- eslint-disable vue/no-v-html -->
<!-- eslint-disable vue/no-v-text-v-html-on-component -->
<template>
  <v-menu
    v-model="showMenu"
    location="bottom right"
    :activator="activator"
    :max-height="filterHeight"
    :close-on-content-click="false"
    @update:model-value="toggleMenu"
  >
    <v-sheet
      class="pa-1"
      tile
      style="max-width: 450px"
    >
      <v-list
        density="compact"
        class="pa-0 dataset-table-header-actions"
      >
        <slot
          name="prepend-items"
          :hide="() => {showMenu = false}"
        />

        <!-- hide column -->
        <v-list-item
          v-if="fixed"
          class="pl-2"
          :title="t('hide')"
          @click="$emit('hide');showMenu=false"
        >
          <template #prepend>
            <v-icon
              :icon="mdiEyeOffOutline"
              size="small"
            />
          </template>
        </v-list-item>

        <!-- fix column to the left -->
        <v-list-item
          v-if="!noFix"
          class="pl-2"
          :class="{'v-item--active v-list-item--active': fixed}"
          :title="t('fixLeft')"
          @click="$emit('fix-col');showMenu=false"
        >
          <template #prepend>
            <v-icon
              :icon="mdiFormatHorizontalAlignLeft"
              size="small"
            />
          </template>
        </v-list-item>

        <!-- sorting -->
        <template v-if="header.sortable">
          <v-list-item
            :active="sort === 1"
            class="pl-2"
            :title="t('sortAsc')"
            @click="toggleSort(1)"
          >
            <template #prepend>
              <v-icon
                :icon="mdiSortAscending"
                size="small"
              />
            </template>
          </v-list-item>
          <v-list-item
            :active="sort === -1"
            class="pl-2"
            :title="t('sortDesc')"
            @click="toggleSort(-1)"
          >
            <template #prepend>
              <v-icon
                :icon="mdiSortDescending"
                size="small"
              />
            </template>
          </v-list-item>
        </template>

        <!-- show help -->
        <v-list-item
          v-if="!!header.tooltip"
          class="pl-2"
          :active="showHelp"
          :title="t('showHelp')"
          @click="showHelp = !showHelp"
        >
          <template #prepend>
            <v-icon
              :icon="mdiInformation"
              size="small"
            />
          </template>
        </v-list-item>
        <v-alert
          v-if="showHelp"
          color="info"
          variant="text"
          tile
          style="overflow-wrap: break-word"
          class="mt-0 mb-2 pa-2"
          v-html="header.tooltip"
        />
      </v-list>

      <v-list-subheader
        v-if="showEnum || showEquals || showStartsWith || showBoolEquals || showNumCompare || showDateCompare"
        dense
        style="height:22px"
        class="pl-2"
      >
        {{ t('filter') }}
      </v-list-subheader>
      <template v-if="showEquals">
        <v-text-field
          v-for="i in equals.length"
          :key="i"
          v-model="equals[i - 1]"
          :label="i === 1 ? 'égal' : 'ou égal'"
          variant="outlined"
          hide-details
          density="compact"
          class="mt-1"
          clearable
          @keyup.enter="emitEqualsFilter()"
          @click:clear="equals[i - 1] = ''; emitEqualsFilter"
          @change="emitEqualsFilter"
        >
          <template #append>
            <v-btn
              v-if="i === equals.length - 1"
              class="mr-1"
              :disabled="equals.length <= 1"
              color="primary"
              :title="t('applyFilter')"
              :icon="mdiCheck"
              @click="emitEqualsFilter"
            />
            <div
              v-else
              style="width:40px;height:36px;"
            />
          </template>
        </v-text-field>
      </template>
      <v-text-field
        v-if="showStartsWith"
        v-model="startsWith"
        label="commence par"
        variant="outlined"
        hide-details
        density="compact"
        class="mt-1"
        @keyup.enter="startsWith && emitFilter({value: startsWith, formattedValue: startsWith, operator: 'starts', property: header.property})"
      >
        <template #append>
          <v-btn
            class="mr-1"
            :disabled="!startsWith"
            color="primary"
            :title="t('applyFilter')"
            :icon="mdiCheck"
            @click="startsWith && emitFilter({value: startsWith, formattedValue: startsWith, operator: 'starts', property: header.property})"
          />
        </template>
      </v-text-field>

      <v-text-field
        v-if="showSearch"
        v-model="search"
        label="contient des mots"
        variant="outlined"
        hide-details
        density="compact"
        class="mt-1"
        @keyup.enter="search && emitFilter({value: search, formattedValue: search, operator: 'search', property: header.property})"
      >
        <template #append>
          <v-btn
            class="mr-1"
            :disabled="!search"
            color="primary"
            :title="t('applyFilter')"
            :icon="mdiCheck"
            @click="search && emitFilter({value: search, formattedValue: search, operator: 'search', property: header.property})"
          />
        </template>
      </v-text-field>

      <v-text-field
        v-if="showContains"
        v-model="contains"
        label="contient des caractères"
        variant="outlined"
        hide-details
        density="compact"
        class="mt-1"
        @keyup.enter="contains && emitFilter({value: contains, formattedValue: contains, operator: 'contains', property: header.property})"
      >
        <template #append>
          <v-btn
            class="mr-1"
            :disabled="!contains"
            color="primary"
            :title="t('applyFilter')"
            :icon="mdiCheck"
            @click="contains && emitFilter({value: contains, formattedValue: contains, operator: 'contains', property: header.property})"
          />
        </template>
      </v-text-field>

      <v-list
        v-if="showBoolEquals"
        density="compact"
        class="py-0"
      >
        <v-list-item
          :active="equalsBool === true"
          @click="emitFilter({value: 'true', formattedValue: formattedTrue, operator: 'eq', property: header.property})"
        >
          {{ formattedTrue }}
        </v-list-item>
        <v-list-item
          :value="equalsBool === false"
          @click="emitFilter({value: 'false', formattedValue: formattedFalse, operator: 'eq', property: header.property})"
        >
          {{ formattedFalse }}
        </v-list-item>
      </v-list>

      <!-- num interval -->
      <v-text-field
        v-if="showNumCompare"
        v-model="gte"
        label="supérieur ou égal à"
        variant="outlined"
        hide-details
        density="compact"
        class="mt-1"
        type="number"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append>
          <div style="width:36px;height:36px;" />
        </template>
      </v-text-field>
      <v-text-field
        v-if="showNumCompare"
        v-model="lte"
        label="inférieur ou égal à"
        variant="outlined"
        hide-details
        density="compact"
        class="mt-1"
        type="number"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append>
          <v-btn
            :disabled="!lte && !gte"
            color="primary"
            :title="t('applyFilter')"
            :icon="mdiCheck"
            @click="emitIntervalFilter"
          />
        </template>
      </v-text-field>

      <!-- date interval -->
      <v-text-field
        v-if="showDateCompare"
        :model-value="gte && formatValue(gte, header.property, null, localeDayjs)"
        label="supérieur ou égal à"
        variant="outlined"
        hide-details
        density="compact"
        class="mt-1"
        readonly
        clearable
        @click:clear="gte = undefined"
        @focus="editDate = 'gte'"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append>
          <div style="width:36px;height:36px;" />
        </template>
      </v-text-field>
      <v-text-field
        v-if="showDateCompare"
        :model-value="lte && formatValue(lte, header.property, null, localeDayjs)"
        label="inférieur ou égal à"
        variant="outlined"
        hide-details
        density="compact"
        class="mt-1"
        readonly
        clearable
        @click:clear="lte = undefined"
        @focus="editDate = 'lte'"
        @keyup.enter="emitIntervalFilter"
      >
        <template #append>
          <v-btn
            :disabled="!lte && !gte"
            color="primary"
            :title="t('applyFilter')"
            :icon="mdiCheck"
            @click="emitIntervalFilter"
          />
        </template>
      </v-text-field>
      <v-date-picker
        v-if="editDate === 'gte'"
        v-model="gte"
        no-title
      />
      <v-date-picker
        v-if="editDate === 'lte'"
        v-model="lte"
        no-title
      />

      <!-- enum -->
      <v-list
        v-if="showEnum"
        density="compact"
        class="py-0"
      >
        <v-list-item
          v-for="{value, important} in fullEnum"
          :key="value"
          :active="equals.includes(value)"
          :style="{'minHeight': enumDense ? '24px' : '32px'}"
          class="px-2"
          @click="toggleEquals(value)"
        >
          <template #prepend>
            <v-icon
              v-if="equals.includes(value)"
              color="primary"
              :icon="mdiCheckboxMarked"
              :size="enumDense ? 'small' : undefined"
            />
            <v-icon
              v-else
              :icon="mdiCheckboxBlankOutline"
              :size="enumDense ? 'small' : undefined"
            />
          </template>

          <v-list-item-title :class="{'font-weight-bold': important}">
            {{ formatValue(value, header.property, null, localeDayjs) }}
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-sheet>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  hide: Masquer cette colonne
  sortAsc: Tri ascendant
  sortDesc: Tri descendant
  filter: "Filtrer :"
  applyFilter: Appliquer le filtre
  info: "Informations :"
  fixLeft: "Fixer la colonne à gauche"
  showHelp: "Afficher la description"
en:
  hide: Hide this column
  sortAsc: Ascending sort
  sortDesc: Descending sort
  filter: "Filter:"
  applyFilter: Apply filter
  info: "Information:"
  fixLeft: "Fix the column to the left"
  showHelp: "Show description"
</i18n>

<script lang="ts" setup>
import { mdiInformation, mdiEyeOffOutline, mdiFormatHorizontalAlignLeft, mdiSortAscending, mdiSortDescending, mdiCheckboxMarked, mdiCheckboxBlankOutline, mdiCheck } from '@mdi/js'
import { type TableHeaderWithProperty } from './use-headers'
import { type DatasetFilter } from '~/composables/dataset-filters'
import { formatValue } from '~/composables/dataset-lines'

const { header, localEnum, filters, closeOnFilter } = defineProps({
  header: { type: Object as () => TableHeaderWithProperty, required: true },
  filters: { type: Array as () => DatasetFilter[], required: true },
  filterHeight: { type: Number, required: true },
  fixed: { type: Boolean, default: false },
  activator: { type: String, required: true },
  noFix: { type: Boolean, default: false },
  localEnum: { type: Array, required: false, default: null },
  closeOnFilter: { type: Boolean, default: false }
})

const sort = defineModel<1 | -1>('sort')

const emit = defineEmits<{
  filter: [DatasetFilter],
  hide: [],
  'fix-col': []
}>()

const localeDayjs = useLocaleDayjs()
const { t } = useI18n()

const showMenu = ref(false)
const equals = ref<string[]>([])
const startsWith = ref('')
const search = ref('')
const contains = ref('')
const equalsBool = ref<boolean>()
const lte = ref<string>()
const gte = ref<string>()
const editDate = ref<string>()
const showHelp = ref(false)

const formattedTrue = formatValue(true, header.property, null, localeDayjs)
const formattedFalse = formatValue(false, header.property, null, localeDayjs)

const fullEnum = computed(() => {
  if (!showEnum.value) return
  const fullEnum = []
  for (const value of localEnum ?? []) {
    fullEnum.push({ value: value + '', important: true })
  }
  if (header.property.enum) {
    for (const value of header.property.enum.slice().sort()) {
      if (!localEnum?.includes(value)) fullEnum.push({ value: value + '' })
    }
  }
  return fullEnum
})

const showEnum = computed(() => {
  if (header.property['x-capabilities'] && header.property['x-capabilities'].index === false) return false
  if (localEnum && localEnum.length) return true
  return header.property.enum && header.property['x-cardinality'] && header.property['x-cardinality'] > 1
})

const enumDense = computed(() => showEnum.value && fullEnum.value?.length && fullEnum.value?.length > 4)

const showEquals = computed(() => {
  if (showEnum.value) return false
  if (header.property['x-capabilities'] && header.property['x-capabilities'].index === false) return false
  if (header.property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
  if (header.property.type === 'string' && (!header.property.format || header.property.format === 'uri-reference')) return true
  if (header.property.type === 'number' || header.property.type === 'integer') return true
  return false
})

const showBoolEquals = computed(() => {
  if (header.property['x-capabilities'] && header.property['x-capabilities'].index === false) return false
  return !showEnum.value && header.property.type === 'boolean'
})

const showStartsWith = computed(() => header.property.type === 'string' && showEquals.value && !header.property['x-labels'])

const showNumCompare = computed(() => {
  if (header.property['x-capabilities'] && header.property['x-capabilities'].index === false) return false
  return header.property.type === 'integer' || header.property.type === 'number'
})

const showDateCompare = computed(() => {
  if (header.property['x-capabilities'] && header.property['x-capabilities'].index === false) return false
  return header.property.type === 'string' && (header.property.format === 'date' || header.property.format === 'date-time')
})
const showSearch = computed(() => {
  if (showEnum.value) return false
  if (header.property['x-labels']) return false
  if (header.property.type !== 'string') return false
  if (header.property.format && header.property.format !== 'uri-reference') return false
  if (!header.property['x-capabilities'] || header.property['x-capabilities'].text !== false || header.property['x-capabilities'].textStandard !== false) return true
  return false
})
const showContains = computed(() => {
  return header.property['x-capabilities'] && header.property['x-capabilities'].wildcard && !header.property['x-labels']
})
const reversedLabels = computed(() => {
  const reversedLabels: Record<string, string> = {}
  for (const key of Object.keys(header.property['x-labels'] || {})) {
    if (header.property['x-labels']?.[key]) {
      reversedLabels[header.property['x-labels']?.[key]] = key
    }
  }
  return reversedLabels
})

watch(equals, () => {
  if (!showEquals.value) return
  const newEquals = equals.value.filter(v => !!v).concat([''])
  if (JSON.stringify(equals.value) !== JSON.stringify(newEquals)) equals.value = newEquals
}, { deep: true, immediate: true })

const toggleMenu = () => {
  if (!showMenu.value) return
  emptyFilters()
  for (const filter of filters.filter(f => f.property.key === header.property.key)) {
    if (filter.operator === 'gte') gte.value = filter.value
    if (filter.operator === 'lte') lte.value = filter.value
    if (filter.operator === 'starts') startsWith.value = filter.value
    if (filter.operator === 'search') search.value = filter.value
    if (filter.operator === 'contains') contains.value = filter.value
    if (filter.operator === 'in') {
      const values = filter.value.startsWith('"') ? JSON.parse(`[${filter.value}]`) : filter.value.split(',')
      if (header.property.type === 'string' || header.property.type === 'number' || header.property.type === 'integer') {
        equals.value = [...values]
        if (header.property['x-labels']) {
          equals.value = equals.value.map(v => header.property['x-labels']?.[v] ?? v)
        }
      }
      if (header.property.type === 'boolean') equalsBool.value = values[0]
    }
  }
}

const toggleEquals = (value: string) => {
  if (equals.value.includes(value)) equals.value = equals.value.filter(v => v !== value)
  else equals.value.push(value)
  emitEqualsFilter()
}

const emitEqualsFilter = () => {
  let values = equals.value.filter(v => !!v)
  if (header.property['x-labels']) {
    values = values.map(v => reversedLabels.value[v] ?? v)
  }
  const formattedValue = values.join(', ')
  emitFilter({ operator: 'in', value: JSON.stringify(values).slice(1, -1), formattedValue, property: header.property }, false)
}

const emitIntervalFilter = () => {
  if (gte.value) {
    emitFilter({
      operator: 'gte',
      value: gte.value,
      formattedValue: formatValue(gte.value, header.property, null, localeDayjs),
      property: header.property
    })
  }
  if (lte.value) {
    emitFilter({
      operator: 'lte',
      value: lte.value,
      formattedValue: formatValue(lte.value, header.property, null, localeDayjs),
      property: header.property
    })
  }
}
const emitFilter = (filter: DatasetFilter, close = true) => {
  emit('filter', filter)
  if (close || closeOnFilter) {
    showMenu.value = false
  }
}
const emptyFilters = () => {
  equals.value = []
  startsWith.value = ''
  search.value = ''
  contains.value = ''
  equalsBool.value = undefined
  lte.value = undefined
  gte.value = undefined
  editDate.value = undefined
}
const toggleSort = (value: 1 | -1) => {
  console.log('toggle', sort.value, sort.value !== value ? value : undefined)
  sort.value = sort.value !== value ? value : undefined
  showMenu.value = false
}
</script>

<style>
.dataset-table-header-actions .v-list-item__prepend {
  width: 30px;
}
</style>
