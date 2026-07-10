<template>
  <v-menu
    :close-on-content-click="false"
    :max-height="500"
  >
    <template #activator="{ props }">
      <v-btn
        icon
        :color="cols.length ? 'warning' : 'default'"
        size="large"
        :title="t('selectColsTitle')"
        v-bind="props"
      >
        <v-icon :icon="mdiTableColumnPlusAfter" />
      </v-btn>
    </template>
    <v-card :subtitle="t('visibleColumns')">
      <v-card-text class="pt-0">
        <v-btn
          variant="text"
          color="primary"
          :disabled="!cols.length"
          @click="cols = []"
        >
          {{ t('showAll') }}
        </v-btn>
        <template v-for="group in groups">
          <v-checkbox
            v-if="group"
            :key="group"
            :label="group"
            :model-value="groupStatus[group] === 'all'"
            :indeterminate="groupStatus[group] === 'some'"
            color="primary"
            density="compact"
            hide-details
            @update:model-value="() => toggleGroup(group, groupStatus[group] !== 'all')"
          >
            <template #append>
              <v-btn
                :icon="unfoldedGroups[group] ? mdiChevronDown : mdiChevronRight"
                variant="text"
                size="small"
                density="comfortable"
                :title="unfoldedGroups[group] ? t('fold') : t('unfold')"
                :aria-expanded="!!unfoldedGroups[group]"
                @click.stop="unfoldedGroups[group] = !unfoldedGroups[group]"
              />
            </template>
          </v-checkbox>
          <template
            v-for="(prop) in selectableProps.filter(prop => (prop['x-group'] || '') === group)"
            :key="prop.key"
          >
            <v-checkbox
              v-show="!prop['x-group'] || unfoldedGroups[prop['x-group']]"
              :label="colLabel(prop, titleOverrides)"
              :model-value="cols.includes(prop.key)"
              color="primary"
              density="compact"
              hide-details
              :class="{'ml-3': !!prop['x-group']}"
              @update:model-value="checked => toggleCol(prop.key, !!checked)"
            />
          </template>
        </template>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  selectColsTitle: Choisir les colonnes visibles
  visibleColumns: Colonnes visibles
  showAll: Tout afficher
  fold: Plier
  unfold: Déplier
en:
  selectColsTitle: Chose visible columns
  visibleColumns: Visible columns
  showAll: Show all
  fold: Fold
  unfold: Unfold
</i18n>

<script setup lang="ts">
import { mdiChevronDown, mdiChevronRight, mdiTableColumnPlusAfter } from '@mdi/js'
import { isVisibleCol, colLabel } from '../table/use-headers'

const cols = defineModel<string[]>({ default: [] })

// the picker must offer exactly the columns the table can render, with the labels it shows in its headers
const { titleOverrides } = defineProps<{ titleOverrides?: Record<string, string> }>()

const { t } = useI18n()
const { dataset } = useDatasetStore()

const selectableProps = computed(() => dataset.value?.schema?.filter(isVisibleCol) ?? [])

const groups = computed(() => {
  return selectableProps.value.reduce((groups, prop) => {
    if (prop['x-group'] && !groups.includes(prop['x-group'])) groups.push(prop['x-group'])
    return groups
  }, [] as string[]).concat([''])
})

const unfoldedGroups = ref<Record<string, boolean>>({})

const groupStatus = computed(() => {
  const statuses: Record<string, 'all' | 'some' | 'none'> = {}
  for (const group of groups.value ?? []) {
    let nbSelected = 0
    let nbTotal = 0
    for (const prop of selectableProps.value) {
      if (prop['x-group'] !== group) continue
      nbTotal += 1
      if (cols.value.includes(prop.key)) nbSelected += 1
    }
    if (nbTotal === nbSelected) statuses[group] = 'all'
    else if (nbSelected) statuses[group] = 'some'
    else statuses[group] = 'none'
  }
  return statuses
})

const toggleCol = (key: string, checked: boolean) => {
  if (checked) {
    if (!cols.value.includes(key)) cols.value = [...cols.value, key]
  } else {
    cols.value = cols.value.filter(k => k !== key)
  }
}

const toggleGroup = (group: string, value: boolean) => {
  if (value) {
    const newCols = [...cols.value]
    for (const prop of selectableProps.value) {
      if (prop['x-group'] === group && !cols.value.includes(prop.key)) {
        newCols.push(prop.key)
      }
    }
    cols.value = newCols
  } else {
    cols.value = cols.value.filter(v => {
      const prop = selectableProps.value.find(fh => fh.key === v)
      return prop?.['x-group'] !== group
    })
  }
}
</script>

<style lang="css" scoped>
</style>
