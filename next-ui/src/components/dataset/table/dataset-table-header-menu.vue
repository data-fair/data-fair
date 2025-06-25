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
        v-if="!!header.tooltip || header.sortable"
        density="compact"
        class="pa-0 dataset-table-header-actions"
      >
        <slot
          name="prepend-items"
          :hide="() => {showMenu = false}"
        />

        <!-- show help -->
        <template v-if="!!header.tooltip">
          <v-list-item

            class="pl-2"
            :active="showHelp"
            :title="t('showHelp')"
            @click="showHelp = !showHelp"
          >
            <template #prepend>
              <v-icon
                :icon="showHelp ? mdiMenuUp : mdiMenuDown"
                size="small"
              />
            </template>
          </v-list-item>
          <v-alert
            v-if="showHelp"
            variant="text"
            tile
            style="overflow-wrap: break-word"
            class="mt-0 mb-2 pa-2"
            v-html="header.tooltip"
          />
          <v-divider />
        </template>

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
          <v-divider />
        </template>
      </v-list>

      <!-- filters -->
      <template v-if="showSearch || showEnum || showEquals || showStartsWith || showBoolEquals || showNumCompare || showDateCompare">
        <v-list-item
          :disabled="!!newFilter"
          class="pl-2"
          :title="t('addFilter')"
          @click="newFilter = {}"
        />
        <template v-if="newFilter">
          <template v-if="showSearch">
            <v-list-item
              v-if="!newFilter.operator"
              title="recherche textuelle"
              @click="newFilter.operator = 'search'"
            />
            <v-text-field
              v-if="newFilter.operator === 'search'"
              v-model="search"
              placeholder="recherche textuelle"
              variant="outlined"
              hide-details
              density="compact"
              class="mb-1"
              autofocus
              @keyup.enter="search && emitNewFilter(search)"
            >
              <template #append>
                <v-btn
                  class="mr-1"
                  density="comfortable"
                  :disabled="!search"
                  color="primary"
                  :title="t('applyFilter')"
                  :icon="mdiCheck"
                  @click="search && emitNewFilter(search)"
                />
              </template>
            </v-text-field>
          </template>
          <template v-if="showEnum">
            <v-list-item
              v-if="!newFilter.operator"
              title="égal"
              @click="newFilter.operator = 'eq'"
            />
            <template v-if="newFilter.operator === 'eq'">
              <v-list-item
                v-for="{value, important} in fullEnum"
                :key="value"
                :active="equals.includes(value)"
                :style="{'minHeight': enumDense ? '24px' : '32px'}"
                class="px-2"
                @click="equals= [value]; emitEqualsFilter()"
              >
                <v-list-item-title :class="{'font-weight-bold': important}">
                  {{ formatValue(value, header.property, null, localeDayjs) }}
                </v-list-item-title>
              </v-list-item>
            </template>
            <v-list-item
              v-if="!newFilter.operator"
              title="différent"
              @click="newFilter.operator = 'neq'"
            />
            <template v-if="newFilter.operator === 'neq'">
              <v-list-item
                v-for="{value, important} in fullEnum"
                :key="value"
                :active="nEquals.includes(value)"
                :style="{'minHeight': enumDense ? '24px' : '32px'}"
                class="px-2"
                @click="nEquals= [value]; emitNEqualsFilter()"
              >
                <v-list-item-title :class="{'font-weight-bold': important}">
                  {{ formatValue(value, header.property, null, localeDayjs) }}
                </v-list-item-title>
              </v-list-item>
            </template>
            <v-list-item
              v-if="!newFilter.operator"
              title="parmi"
              @click="newFilter.operator = 'in'"
            />
            <template v-if="newFilter.operator === 'in'">
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
              <v-list-item>
                <template #append>
                  <v-btn
                    variant="flat"
                    :disabled="!equals.length"
                    color="primary"
                    density="comfortable"
                    @click="emitEqualsFilter"
                  >
                    Appliquer
                  </v-btn>
                </template>
              </v-list-item>
            </template>
            <v-list-item
              v-if="!newFilter.operator"
              title="non parmi"
              @click="newFilter.operator = 'nin'"
            />
            <template v-if="newFilter.operator === 'nin'">
              <v-list-item
                v-for="{value, important} in fullEnum"
                :key="value"
                :active="nEquals.includes(value)"
                :style="{'minHeight': enumDense ? '24px' : '32px'}"
                class="px-2"
                @click="toggleNEquals(value)"
              >
                <template #prepend>
                  <v-icon
                    v-if="nEquals.includes(value)"
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
              <v-list-item>
                <template #append>
                  <v-btn
                    variant="flat"
                    :disabled="!nEquals.length"
                    color="primary"
                    density="comfortable"
                    @click="emitNEqualsFilter"
                  >
                    Appliquer
                  </v-btn>
                </template>
              </v-list-item>
            </template>
          </template>
          <template v-if="showEquals">
            <v-list-item
              v-if="!newFilter.operator"
              title="égal"
              @click="newFilter.operator = 'eq'"
            />
            <v-text-field
              v-if="newFilter.operator === 'eq'"
              :model-value="equals[0]"
              placeholder="égal"
              variant="outlined"
              hide-details
              density="compact"
              class="mb-1"
              autofocus
              @update:model-value="v => equals = [v]"
              @keyup.enter="equals[0] && emitEqualsFilter()"
            >
              <template #append>
                <v-btn
                  class="mr-1"
                  density="comfortable"
                  :disabled="!equals[0]"
                  color="primary"
                  :title="t('applyFilter')"
                  :icon="mdiCheck"
                  @click="equals[0] && emitEqualsFilter()"
                />
              </template>
            </v-text-field>

            <v-list-item
              v-if="!newFilter.operator"
              title="différent"
              @click="newFilter.operator = 'neq'"
            />
            <v-text-field
              v-if="newFilter.operator === 'neq'"
              :model-value="nEquals[0]"
              placeholder="différent"
              variant="outlined"
              hide-details
              density="compact"
              class="mb-1"
              autofocus
              @update:model-value="v => nEquals = [v]"
              @keyup.enter="nEquals[0] && emitNEqualsFilter()"
            >
              <template #append>
                <v-btn
                  class="mr-1"
                  density="comfortable"
                  :disabled="!nEquals[0]"
                  color="primary"
                  :title="t('applyFilter')"
                  :icon="mdiCheck"
                  @click="nEquals[0] && emitNEqualsFilter()"
                />
              </template>
            </v-text-field>

            <v-list-item
              v-if="!newFilter.operator"
              title="parmi"
              @click="newFilter.operator = 'in'"
            />

            <template v-if="newFilter.operator === 'in'">
              <v-text-field
                v-for="i in equals.length"
                :key="i"
                v-model="equals[i - 1]"
                :label="i === 1 ? 'égal à' : 'ou égal à'"
                variant="outlined"
                hide-details
                density="compact"
                class="mb-1"
                :autofocus="i === 1"
                clearable
              >
                <template #append>
                  <v-btn
                    v-if="i === equals.length - 1"
                    class="mr-1"
                    density="comfortable"
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

            <v-list-item
              v-if="!newFilter.operator"
              title="non parmi"
              @click="newFilter.operator = 'nin'"
            />

            <template v-if="newFilter.operator === 'nin'">
              <v-text-field
                v-for="i in nEquals.length"
                :key="i"
                v-model="nEquals[i - 1]"
                :label="i === 1 ? 'différent de' : 'et différent de'"
                variant="outlined"
                hide-details
                density="compact"
                class="mb-1"
                :autofocus="i === 1"
                clearable
              >
                <template #append>
                  <v-btn
                    v-if="i === nEquals.length - 1"
                    class="mr-1"
                    density="comfortable"
                    :disabled="nEquals.length <= 1"
                    color="primary"
                    :title="t('applyFilter')"
                    :icon="mdiCheck"
                    @click="emitNEqualsFilter"
                  />
                  <div
                    v-else
                    style="width:40px;height:36px;"
                  />
                </template>
              </v-text-field>
            </template>
          </template>
          <template v-if="showStartsWith">
            <v-list-item
              v-if="!newFilter.operator"
              title="commence par"
              @click="newFilter.operator = 'starts'"
            />
            <v-text-field
              v-if="newFilter.operator === 'starts'"
              v-model="startsWith"
              label="commence par"
              variant="outlined"
              hide-details
              density="compact"
              class="mb-1"
              autofocus
              @keyup.enter="startsWith && emitNewFilter(startsWith)"
            >
              <template #append>
                <v-btn
                  class="mr-1"
                  density="comfortable"
                  :disabled="!startsWith"
                  color="primary"
                  :title="t('applyFilter')"
                  :icon="mdiCheck"
                  @click="startsWith && emitNewFilter(startsWith)"
                />
              </template>
            </v-text-field>
          </template>
          <template v-if="showContains">
            <v-list-item
              v-if="!newFilter.operator"
              title="contient les caractères"
              @click="newFilter.operator = 'contains'"
            />
            <v-text-field
              v-if="newFilter.operator === 'contains'"
              v-model="contains"
              label="contient les caractères"
              variant="outlined"
              hide-details
              density="compact"
              class="mb-1"
              @keyup.enter="contains && emitNewFilter(contains)"
            >
              <template #append>
                <v-btn
                  class="mr-1"
                  density="comfortable"
                  :disabled="!contains"
                  color="primary"
                  :title="t('applyFilter')"
                  :icon="mdiCheck"
                  @click="contains && emitNewFilter(contains)"
                />
              </template>
            </v-text-field>
          </template>
          <template v-if="showBoolEquals">
            <v-list-item
              v-if="!newFilter.operator"
              title="égal"
              @click="newFilter.operator = 'eq'"
            />
            <template v-if="newFilter.operator === 'eq'">
              <v-list-item
                :active="equalsBool === true"
                @click="emitNewFilter('true', formattedTrue)"
              >
                {{ formattedTrue }}
              </v-list-item>
              <v-list-item
                :value="equalsBool === false"
                @click="emitNewFilter('false', formattedFalse)"
              >
                {{ formattedFalse }}
              </v-list-item>
            </template>

            <v-list-item
              v-if="!newFilter.operator"
              title="différent"
              @click="newFilter.operator = 'neq'"
            />
            <template v-if="newFilter.operator === 'neq'">
              <v-list-item
                :active="nEqualsBool === true"
                @click="emitNewFilter('true', formattedTrue)"
              >
                {{ formattedTrue }}
              </v-list-item>
              <v-list-item
                :value="nEqualsBool === false"
                @click="emitNewFilter('false', formattedFalse)"
              >
                {{ formattedFalse }}
              </v-list-item>
            </template>
          </template>
          <template v-if="showNumCompare">
            <v-list-item
              v-if="!newFilter.operator"
              title="supérieur ou égal à"
              @click="newFilter.operator = 'gte'"
            />
            <v-text-field
              v-if="newFilter.operator === 'gte'"
              v-model="gte"
              label="supérieur ou égal à"
              variant="outlined"
              hide-details
              density="compact"
              class="mb-1"
              type="number"
              @keyup.enter="gte && emitNewFilter(gte, formatValue(gte, header.property, null, localeDayjs))"
            >
              <template #append>
                <v-btn
                  class="mr-1"
                  density="comfortable"
                  :disabled="!gte"
                  color="primary"
                  :title="t('applyFilter')"
                  :icon="mdiCheck"
                  @click="gte && emitNewFilter(gte, formatValue(gte, header.property, null, localeDayjs))"
                />
              </template>
            </v-text-field>

            <v-list-item
              v-if="!newFilter.operator"
              title="inférieur ou égal à"
              @click="newFilter.operator = 'lte'"
            />
            <v-text-field
              v-if="newFilter.operator === 'lte'"
              v-model="lte"
              label="inférieur ou égal à"
              variant="outlined"
              hide-details
              density="compact"
              class="mb-1"
              type="number"
              @keyup.enter="lte && emitNewFilter(lte, formatValue(lte, header.property, null, localeDayjs))"
            >
              <template #append>
                <v-btn
                  class="mr-1"
                  density="comfortable"
                  :disabled="!lte"
                  color="primary"
                  :title="t('applyFilter')"
                  :icon="mdiCheck"
                  @click="lte && emitNewFilter(lte, formatValue(lte, header.property, null, localeDayjs))"
                />
              </template>
            </v-text-field>
          </template>
          <template v-if="showDateCompare">
            <v-list-item
              v-if="!newFilter.operator"
              title="supérieur ou égal à"
              @click="newFilter.operator = 'gte'"
            />
            <v-date-picker
              v-if="newFilter.operator === 'gte'"
              :model-value="gte && new Date(gte)"
              hide-header
              @update:model-value="v => v && emitNewFilter(localeDayjs.dayjs(v).format('YYYY-MM-DD'), localeDayjs.dayjs(v).format('L'))"
            />

            <v-list-item
              v-if="!newFilter.operator"
              title="inférieur ou égal à"
              @click="newFilter.operator = 'lte'"
            />
            <v-date-picker
              v-if="newFilter.operator === 'lte'"
              :model-value="lte && new Date(lte)"
              hide-header
              @update:model-value="v => v && emitNewFilter(localeDayjs.dayjs(v).format('YYYY-MM-DD'), localeDayjs.dayjs(v).format('L'))"
            />
          </template>
          <template v-if="showExists">
            <v-list-item
              v-if="!newFilter.operator"
              title="existe"
              :active="exists"
              @click="newFilter.operator = 'exists'; emitNewFilter(' ')"
            />
            <v-list-item
              v-if="!newFilter.operator"
              title="n'existe pas"
              :active="nExists"
              @click="newFilter.operator = 'nexists'; emitNewFilter(' ')"
            />
          </template>
        </template>

        <v-divider />
      </template>

      <!-- hide column -->
      <v-list-item
        v-if="!fixed"
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
    </v-sheet>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  hide: Masquer cette colonne
  sortAsc: Tri ascendant
  sortDesc: Tri descendant
  addFilter: Ajouter un filtre
  filter: "Filtrer :"
  applyFilter: Appliquer le filtre
  info: "Informations :"
  fixLeft: "Fixer la colonne à gauche"
  showHelp: "Description"
en:
  hide: Hide this column
  sortAsc: Ascending sort
  sortDesc: Descending sort
  addFilter: Add a filter
  filter: "Filter:"
  applyFilter: Apply filter
  info: "Information:"
  fixLeft: "Fix the column to the left"
  showHelp: "Description"
</i18n>

<script lang="ts" setup>
import { mdiEyeOffOutline, mdiFormatHorizontalAlignLeft, mdiSortAscending, mdiSortDescending, mdiCheckboxMarked, mdiCheckboxBlankOutline, mdiCheck, mdiMenuDown, mdiMenuUp } from '@mdi/js'
import { type TableHeaderWithProperty } from './use-headers'
import { type DatasetFilter } from '~/composables/dataset-filters'
import { formatValue } from '~/composables/dataset-lines'
import useHeaderFilters from './use-header-filters'

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
const nEquals = ref<string[]>([])
const startsWith = ref('')
const search = ref('')
const contains = ref('')
const equalsBool = ref<boolean>()
const nEqualsBool = ref<boolean>()
const lte = ref<string>()
const gte = ref<string>()
const editDate = ref<string>()
const showHelp = ref(false)
const exists = ref(false)
const nExists = ref(false)

const formattedTrue = formatValue(true, header.property, null, localeDayjs)
const formattedFalse = formatValue(false, header.property, null, localeDayjs)

const { showSearch, showContains, showEnum, showEquals, showStartsWith, showBoolEquals, showNumCompare, showDateCompare, fullEnum, enumDense, showExists } = useHeaderFilters(computed(() => header), computed(() => localEnum))

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

watch(nEquals, () => {
  if (!showEquals.value) return
  const newNequals = nEquals.value.filter(v => !!v).concat([''])
  if (JSON.stringify(nEquals.value) !== JSON.stringify(newNequals)) nEquals.value = newNequals
}, { deep: true, immediate: true })

const toggleMenu = () => {
  if (!showMenu.value) return
  emptyFilters()
  newFilter.value = undefined
  for (const filter of filters.filter(f => f.property.key === header.property.key)) {
    if (filter.operator === 'gte') gte.value = filter.value
    if (filter.operator === 'lte') lte.value = filter.value
    if (filter.operator === 'starts') startsWith.value = filter.value
    if (filter.operator === 'search') search.value = filter.value
    if (filter.operator === 'contains') contains.value = filter.value
    if (filter.operator === 'exists') exists.value = true
    if (filter.operator === 'nexists') nExists.value = true
    if (filter.operator === 'in' || filter.operator === 'eq') {
      const values = filter.operator === 'eq' ? [filter.value] : filter.value.startsWith('"') ? JSON.parse(`[${filter.value}]`) : filter.value.split(',')
      if (header.property.type === 'string' || header.property.type === 'number' || header.property.type === 'integer') {
        equals.value = [...values]
        if (header.property['x-labels']) {
          equals.value = equals.value.map(v => header.property['x-labels']?.[v] ?? v)
        }
      }
      if (header.property.type === 'boolean') equalsBool.value = values[0]
    }
    if (filter.operator === 'nin' || filter.operator === 'neq') {
      const values = filter.operator === 'neq' ? [filter.value] : filter.value.startsWith('"') ? JSON.parse(`[${filter.value}]`) : filter.value.split(',')
      if (header.property.type === 'string' || header.property.type === 'number' || header.property.type === 'integer') {
        nEquals.value = [...values]
        if (header.property['x-labels']) {
          nEquals.value = nEquals.value.map(v => header.property['x-labels']?.[v] ?? v)
        }
      }
      if (header.property.type === 'boolean') nEqualsBool.value = values[0]
    }
  }
}

const toggleEquals = (value: string) => {
  if (equals.value.includes(value)) equals.value = equals.value.filter(v => v !== value)
  else equals.value.push(value)
}

const toggleNEquals = (value: string) => {
  if (nEquals.value.includes(value)) nEquals.value = nEquals.value.filter(v => v !== value)
  else nEquals.value.push(value)
}

const emitEqualsFilter = () => {
  let values: (string | number)[] = equals.value.filter(v => !!v)
  if (header.property['x-labels']) {
    values = values.map(v => reversedLabels.value[v] ?? v)
  } else if (header.property.type === 'number' || header.property.type === 'integer') {
    values = values.map(Number)
  }
  const formattedValue = values.join(', ')
  emitFilter({ operator: 'in', value: JSON.stringify(values).slice(1, -1), formattedValue, property: header.property }, false)
  showMenu.value = false
}

const emitNEqualsFilter = () => {
  let values: (string | number)[] = nEquals.value.filter(v => !!v)
  if (header.property['x-labels']) {
    values = values.map(v => reversedLabels.value[v] ?? v)
  } else if (header.property.type === 'number' || header.property.type === 'integer') {
    values = values.map(Number)
  }
  const formattedValue = values.join(', ')
  emitFilter({ operator: 'nin', value: JSON.stringify(values).slice(1, -1), formattedValue, property: header.property }, false)
  showMenu.value = false
}

/* const emitIntervalFilter = () => {
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
} */
const emitFilter = (filter: DatasetFilter, close = true) => {
  emit('filter', filter)
  if (close || closeOnFilter) {
    showMenu.value = false
  }
}
const emitNewFilter = (value: any, formattedValue?: any) => {
  formattedValue = formattedValue ?? value
  const operator = newFilter.value?.operator
  if (!operator) throw new Error('operator not selected')
  emit('filter', { operator, property: header.property, value, formattedValue })
  showMenu.value = false
}
const emptyFilters = () => {
  equals.value = []
  startsWith.value = ''
  search.value = ''
  contains.value = ''
  equalsBool.value = undefined
  nEqualsBool.value = undefined
  lte.value = undefined
  gte.value = undefined
  editDate.value = undefined
}
const toggleSort = (value: 1 | -1) => {
  sort.value = sort.value !== value ? value : undefined
  showMenu.value = false
}

const newFilter = ref<Partial<DatasetFilter>>()
</script>

<style>
.dataset-table-header-actions .v-list-item__prepend {
  width: 30px;
}
</style>
