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
            :model-value="groupStatus[group] !== 'none'"
            :color="groupStatus[group] === 'some' ? 'grey' : 'primary'"
            density="compact"
            hide-details
            @update:model-value="value => toggleGroup(group, !!value)"
          >
            <template #append>
              <v-btn
                v-if="unfoldedGroups[group]"
                :key="'fold-down-' + group"
                icon
                style="margin-top:-8px;"
                :title="$t('fold')"
                @click="unfoldedGroups[group] = false"
              >
                <v-icon>
                  mdi-menu-down
                </v-icon>
              </v-btn>
              <v-btn
                v-if="!unfoldedGroups[group]"
                :key="'fold-up-' + group"
                icon
                style="margin-top:-8px;"
                :title="$t('unfold')"
                @click="unfoldedGroups[group] = true"
              >
                <v-icon>
                  mdi-menu-left
                </v-icon>
              </v-btn>
            </template>
          </v-checkbox>
          <template
            v-for="(prop) in dataset?.schema?.filter(prop => (prop['x-group'] || '') === group)"
            :key="prop.key"
          >
            <v-checkbox
              v-show="!prop['x-group'] || unfoldedGroups[prop['x-group']]"
              :value="prop.key"
              :label="prop.title || prop['x-originalName'] || prop.key"
              :model-value="cols"
              color="primary"
              density="compact"
              hide-details
              :class="{'ml-3': !!prop['x-group']}"
              @update:model-value="newCols => {cols = newCols ?? []}"
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
  showAll: tout afficher
  fold: plier
  unfold: déplier
en:
  selectColsTitle: Chose visible columns
  visibleColumns: Visible columns
  showAll: show all
  fold: fold
  unfold: unfold
</i18n>

<script setup lang="ts">
import { mdiTableColumnPlusAfter } from '@mdi/js'

const cols = defineModel<string[]>({ default: [] })

const { t } = useI18n()
const { dataset } = useDatasetStore()

const groups = computed(() => {
  return dataset.value?.schema?.reduce((groups, prop) => {
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
    for (const prop of dataset.value?.schema ?? []) {
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

const toggleGroup = (group: string, value: boolean) => {
  if (value) {
    const newCols = [...cols.value]
    for (const prop of dataset.value?.schema ?? []) {
      if (prop['x-group'] === group && !cols.value.includes(prop.key)) {
        newCols.push(prop.key)
      }
    }
    cols.value = newCols
  } else {
    cols.value = cols.value.filter(v => {
      const prop = dataset.value?.schema?.find(fh => fh.value === v)
      return prop?.['x-group'] !== group
    })
  }
}
</script>

<style lang="css" scoped>
</style>
