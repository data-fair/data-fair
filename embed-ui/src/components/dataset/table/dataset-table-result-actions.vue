<template>
  <v-btn-group
    density="compact"
  >
    <v-btn
      v-if="selectedResults.some(r => r._id === result._id)"
      :title="t('unselectLine')"
      color="primary"
      :size="dense ? 'md' : 'large'"
      variant="text"
      :icon="mdiCheckboxMarked"
      :disabled="saving"
      @click="selectedResults = selectedResults.filter(r => r !== result)"
    />
    <v-btn
      v-else
      :size="dense ? 'md' : 'large'"
      variant="text"
      :title="t('selectLine')"
      :icon="mdiCheckboxBlankOutline"
      :disabled="saving"
      @click="selectedResults.push(result)"
    />
    <v-btn
      v-if="canDeleteLine"
      :size="dense ? 'md' : 'large'"
      color="warning"
      :title="t('deleteLine')"
      variant="text"
      :icon="mdiTrashCanOutline"
      :disabled="saving"
      @click="emit('delete')"
    />
    <v-btn
      v-if="canUpdateLine"
      :icon="mdiPencil"
      :size="dense ? 'md' : 'large'"
      variant="text"
      :title="t('editLine')"
      :disabled="saving"
      @click="emit('edit')"
    />
  </v-btn-group>
</template>

<i18n lang="yaml">
  fr:
    editLine: Éditer une ligne
    deleteLine: Supprimer une ligne
    revisionsHistory: Historique des révisions
    selectLine: Sélectionner la ligne
    unselectLine: Désélectionner la ligne
  en:
    editLine: Edit a line
    deleteLine: Delete a line
    revisionsHistory: Revisions history
    selectLine: Select the line
    unselectLine: Deselect the line
</i18n>

<script lang="ts" setup>
import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiPencil, mdiTrashCanOutline } from '@mdi/js'
import { type ExtendedResult } from '~/composables/dataset-lines'
import useDatasetEdition from './use-dataset-edition'

defineProps({
  result: { type: Object as () => ExtendedResult, required: true },
  dense: { type: Boolean, default: false }
})

const emit = defineEmits(['edit', 'delete'])

const selectedResults = defineModel<ExtendedResult[]>('selected-results', { default: [] })

const { can } = useDatasetStore()
const { t } = useI18n()
const { saving } = useDatasetEdition()

const canDeleteLine = can('deleteLine')
const canUpdateLine = can('updateLine')
</script>
