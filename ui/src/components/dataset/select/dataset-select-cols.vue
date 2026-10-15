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
        :title="btnTitle"
        :aria-label="btnTitle"
        v-bind="props"
      >
        <!-- the count makes the "some columns are hidden" state perceivable without the color (RGAA 3.1) -->
        <v-badge
          :model-value="!!hiddenCount"
          :content="hiddenCount"
          :label="btnTitle"
          color="warning"
        >
          <v-icon :icon="mdiTableColumnPlusAfter" />
        </v-badge>
      </v-btn>
    </template>
    <v-card :subtitle="t('visibleColumns')">
      <!-- a menu of checkable items (RGAA 7.3): arrows move between the lines (v-list), Space
           or Enter toggles one, ArrowRight / ArrowLeft unfold and fold a group -->
      <v-list
        ref="list"
        role="menu"
        :aria-label="t('visibleColumns')"
        density="compact"
        class="dataset-select-cols pt-0"
      >
        <v-list-item
          role="menuitem"
          :disabled="!cols.length"
          :title="t('showAll')"
          base-color="primary"
          @click="cols = []"
        />
        <template v-for="group in groups">
          <v-list-item
            v-if="group"
            :key="group"
            role="menuitemcheckbox"
            :aria-checked="groupStatus[group] === 'all' ? 'true' : groupStatus[group] === 'some' ? 'mixed' : 'false'"
            :aria-expanded="!!unfoldedGroups[group]"
            :data-group="group"
            :title="group"
            @click="toggleGroup(group, groupStatus[group] !== 'all')"
            @keydown="(e: KeyboardEvent) => onGroupKeydown(e, group)"
          >
            <template #prepend>
              <v-icon
                :icon="checkIcon(groupStatus[group])"
                :color="groupStatus[group] === 'none' ? undefined : 'primary'"
              />
            </template>
            <template #append>
              <!-- for the mouse, the keyboard folds with the arrows -->
              <v-btn
                :icon="unfoldedGroups[group] ? mdiChevronDown : mdiChevronRight"
                tabindex="-1"
                variant="text"
                size="small"
                density="comfortable"
                :title="unfoldedGroups[group] ? t('fold') : t('unfold')"
                @click.stop="unfoldedGroups[group] = !unfoldedGroups[group]"
              />
            </template>
          </v-list-item>
          <template
            v-for="(prop) in selectableProps.filter(prop => (prop['x-group'] || '') === group)"
            :key="prop.key"
          >
            <v-list-item
              v-if="!prop['x-group'] || unfoldedGroups[prop['x-group']]"
              role="menuitemcheckbox"
              :aria-checked="cols.includes(prop.key) ? 'true' : 'false'"
              :title="colLabel(prop, titleOverrides)"
              :class="{'pl-8': !!prop['x-group']}"
              @click="toggleCol(prop.key, !cols.includes(prop.key))"
              @keydown="(e: KeyboardEvent) => prop['x-group'] && onGroupColKeydown(e, prop['x-group'])"
            >
              <template #prepend>
                <v-icon
                  :icon="checkIcon(cols.includes(prop.key) ? 'all' : 'none')"
                  :color="cols.includes(prop.key) ? 'primary' : undefined"
                />
              </template>
            </v-list-item>
          </template>
        </template>
      </v-list>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  selectColsTitle: Choisir les colonnes visibles
  selectColsTitleHidden: "Choisir les colonnes visibles (1 colonne masquée) | Choisir les colonnes visibles ({count} colonnes masquées)"
  visibleColumns: Colonnes visibles
  showAll: Tout afficher
  fold: Plier
  unfold: Déplier
en:
  selectColsTitle: Chose visible columns
  selectColsTitleHidden: "Chose visible columns (1 column hidden) | Chose visible columns ({count} columns hidden)"
  visibleColumns: Visible columns
  showAll: Show all
  fold: Fold
  unfold: Unfold
</i18n>

<script setup lang="ts">
import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiChevronDown, mdiChevronRight, mdiMinusBox, mdiTableColumnPlusAfter } from '@mdi/js'
import { isVisibleCol, colLabel } from '../table/use-headers'

const cols = defineModel<string[]>({ default: () => [] })

// the picker must offer exactly the columns the table can render, with the labels it shows in its headers
const { titleOverrides } = defineProps<{ titleOverrides?: Record<string, string> }>()

const { t } = useI18n()
const { dataset } = useDatasetStore()

const selectableProps = computed(() => dataset.value?.schema?.filter(isVisibleCol) ?? [])
// cols empty means all columns are visible
const hiddenCount = computed(() => cols.value.length ? selectableProps.value.filter(p => !cols.value.includes(p.key)).length : 0)
// explicit aria-label: otherwise the badge's own label becomes the button's accessible name
const btnTitle = computed(() => hiddenCount.value ? t('selectColsTitleHidden', { count: hiddenCount.value }, hiddenCount.value) : t('selectColsTitle'))

const groups = computed(() => {
  return selectableProps.value.reduce((groups, prop) => {
    if (prop['x-group'] && !groups.includes(prop['x-group'])) groups.push(prop['x-group'])
    return groups
  }, [] as string[]).concat([''])
})

const unfoldedGroups = ref<Record<string, boolean>>({})

const checkIcon = (status: 'all' | 'some' | 'none') => status === 'all' ? mdiCheckboxMarked : status === 'some' ? mdiMinusBox : mdiCheckboxBlankOutline

const list = useTemplateRef('list')
const onGroupKeydown = (e: KeyboardEvent, group: string) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    unfoldedGroups.value[group] = e.key === 'ArrowRight'
  }
}
// from a column of a group, ArrowLeft goes back to the group's line
const onGroupColKeydown = (e: KeyboardEvent, group: string) => {
  if (e.key !== 'ArrowLeft') return
  e.preventDefault()
  const el = (list.value?.$el as HTMLElement | undefined)?.querySelector<HTMLElement>(`[data-group="${CSS.escape(group)}"]`)
  el?.focus()
}

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

<style lang="css">
/* the list's own focus style is a faint overlay (RGAA 10.7) */
.dataset-select-cols .v-list-item:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
</style>
