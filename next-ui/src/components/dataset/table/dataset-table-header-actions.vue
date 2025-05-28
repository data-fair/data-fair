<template>
  <v-btn-group
    v-if="results.length >= 2"
    :elevation="selectedResults.length >= 2 ? 4 : 0"
    density="compact"
  >
    <v-btn
      v-if="selectedResults.length"
      :title="t('unselectAllLines')"
      :color="selectedResults.length === results.length ? 'primary' : 'grey'"
      size="large"
      variant="text"
      :icon="mdiCheckboxMarked"
      @click="selectedResults = []"
    />
    <v-btn
      v-else
      :key="'header-actions-check2-' + h"
      size="large"
      variant="text"
      :title="t('selectAllLines')"
      :icon="mdiCheckboxBlankOutline"
      @click="selectedResults = [...results]"
    />
    <v-btn
      v-if="canDeleteLine && selectedResults.length >=2"
      size="large"
      color="warning"
      variant="text"
      :title="t('deleteAllLines')"
      :icon="mdiTrashCanOutline"
      @click="deletingLines = [...selectedResults]; deleteselectedResultsDialog = true;"
    />
    <v-btn
      v-if="canUpdateLine && selectedResults.length >= 2"
      :icon="mdiPencil"
      size="large"
      variant="text"
      :title="t('editAllLines')"
      @click="editingLines = [...selectedResults]; editselectedResultsDialog = true;"
    />
  </v-btn-group>
</template>

<i18n lang="yaml">
  fr:
    selectAllLines: Sélectionner toutes les lignes
    unselectAllLines: Désélectionner toutes les lignes
    deleteAllLines: Supprimer les lines sélectionnées
    deleteAllLinesWarning: Attention, la donnée de ces lignes sera perdue définitivement.
    editAllLines: Éditer les lignes sélectionnées
  en:
    selectAllLines: Select all lines
    unselectAllLines: Deselect all lines
    deleteAllLines: Delete the selected lines
    deleteAllLinesWarning: Warning, the data from these lines will be lost definitively
    editAllLines: Edit the selected lines
</i18n>

<script lang="ts" setup>
import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiPencil, mdiTrashCanOutline } from '@mdi/js'
import { type ExtendedResult } from '~/composables/dataset-lines'

defineProps({
  results: { type: Object as () => ExtendedResult[], required: true }
})

const selectedResults = defineModel<ExtendedResult[]>('selected-results', { default: [] })

const { can } = useDatasetStore()
const { t } = useI18n()

const deleteselectedResultsDialog = ref(false)
const editselectedResultsDialog = ref(false)

const editingLines = ref<ExtendedResult[]>()
const deletingLines = ref<ExtendedResult[]>()

const canDeleteLine = can('deleteLine')
const canUpdateLine = can('updateLine')
</script>
