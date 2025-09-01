<template>
  <v-btn-group
    :elevation="selectedResults.length >= 2 ? 4 : 0"
    density="compact"
  >
    <template v-if="results.length >= 2">
      <v-btn
        v-if="selectedResults.length"
        :title="t('unselectAllLines')"
        :color="selectedResults.length === results.length ? 'primary' : 'grey'"
        :size="dense ? 'md' : 'large'"
        variant="text"
        :icon="mdiCheckboxMarked"
        :disabled="saving"
        @click="selectedResults = []"
      />
      <v-btn
        v-else
        :key="'header-actions-check2-' + h"
        :size="dense ? 'md' : 'large'"
        variant="text"
        :title="t('selectAllLines', {nbLines: results.length})"
        :icon="mdiCheckboxBlankOutline"
        :disabled="saving"
        @click="selectedResults = [...results]"
      />
    </template>
    <template v-if="selectedResults.length >=2">
      <v-btn
        v-if="canDeleteLine"
        :size="dense ? 'md' : 'large'"
        color="warning"
        variant="text"
        :title="t('deleteAllLines', {nbLines: selectedResults.length})"
        :icon="mdiTrashCanOutline"
        :disabled="saving"
        @click="deletingResults = [...selectedResults]; deleteSelectedResultsDialog = true;"
      />
      <v-btn
        v-if="canUpdateLine && selectedResults.length >= 2"
        :icon="mdiPencil"
        :size="dense ? 'md' : 'large'"
        variant="text"
        :title="t('editAllLines', {nbLines: selectedResults.length})"
        :disabled="saving"
        @click="showEditSelectedResultsDialog.execute()"
      />
    </template>
    <template v-else>
      <v-btn
        v-if="canCreateLine"
        :icon="mdiPlusCircle"
        :size="dense ? 'md' : 'large'"
        variant="text"
        color="primary"
        :title="t('addLine')"
        :disabled="saving"
        @click="addLineDialog = true"
      />
      <dataset-rest-upload-actions
        v-if="canBulkLines"
      >
        <template #activator="{props: activatorProps, title}">
          <v-btn
            :size="dense ? 'md' : 'large'"
            variant="text"
            color="primary"
            :title="title"
            v-bind="activatorProps"
            :icon="mdiUpload"
          />
        </template>
      </dataset-rest-upload-actions>
    </template>
  </v-btn-group>

  <v-dialog
    v-model="editSelectedResultsDialog"
    max-width="600px"
  >
    <v-card :title="t('editAllLines', {nbLines: editingLines?.length})">
      <v-form
        ref="editSelectedLinesForm"
        v-model="editSelectedLinesValid"
      >
        <v-card-text>
          <dataset-edit-multiple-lines
            v-if="editSelectedResultsDialog && editingLines?.length"
            v-model="editingLinesPatch"
            :lines="editingLines"
            :selected-cols="selectedCols"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="editSelectedResultsDialog = false"
          >
            {{ t('cancel') }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="saveLinesPatch.loading.value"
            :disabled="!editSelectedLinesValid"
            @click="saveLinesPatch"
          >
            {{ t('save') }}
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="deleteSelectedResultsDialog"
    max-width="500px"
  >
    <v-card :title="t('deleteAllLines', {nbLines: deletingResults?.length})">
      <v-card-text>
        <v-alert
          :value="true"
          type="warning"
        >
          {{ t('deleteAllLinesWarning') }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="deleteSelectedResultsDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          variant="flat"
          :loading="deleteLines.loading.value"
          @click="deleteLines.execute()"
        >
          {{ t('delete') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="addLineDialog"
    max-width="700px"
  >
    <v-card :title="t('addLine')">
      <v-form
        ref="addLineForm"
        v-model="addLineValid"
      >
        <v-card-text>
          <dataset-edit-line-form
            v-model="newLine"
            :loading="addLine.loading.value"
            :extension="true"
            @on-file-upload="(f: File) => {file = f}"
          />
        </v-card-text>
      </v-form>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="addLineDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="deleteLines.loading.value"
          @click="addLine.execute()"
        >
          {{ t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
  fr:
    cancel: Annuler
    delete: Supprimer
    save: Enregistrer
    addLine: Ajouter une ligne
    selectAllLines: Sélectionner les {nbLines} lignes
    unselectAllLines: Désélectionner toutes les lignes
    deleteAllLines: Supprimer les {nbLines} lignes sélectionnées
    deleteAllLinesWarning: Attention, la donnée de ces lignes sera perdue définitivement.
    editAllLines: Éditer les lignes {nbLines} sélectionnées
  en:
    cancel: Cancel
    delete: Delete
    save: Save
    addLine: Add a line
    selectAllLines: Select the {nbLines} lines
    unselectAllLines: Deselect all lines
    deleteAllLines: Delete the {nbLines} selected lines
    deleteAllLinesWarning: Warning, the data from these lines will be lost definitively
    editAllLines: Edit the {nbLines} selected lines
</i18n>

<script lang="ts" setup>
import { mdiCheckboxBlankOutline, mdiCheckboxMarked, mdiPencil, mdiTrashCanOutline, mdiPlusCircle, mdiUpload } from '@mdi/js'
import { type VForm } from 'vuetify/components'
import { type ExtendedResult } from '~/composables/dataset-lines'
import useDatasetEdition from './use-dataset-edition'

defineProps({
  results: { type: Object as () => ExtendedResult[], required: true },
  dense: { type: Boolean, default: false },
  selectedCols: { type: Array as () => string[], required: true }
})

const { selectedResults, bulkLines, saveLine, saving } = useDatasetEdition()

const { can, jsonSchemaFetch, id: datasetId } = useDatasetStore()
const { t } = useI18n()

if (!jsonSchemaFetch.initialized.value) jsonSchemaFetch.refresh()

const deleteSelectedResultsDialog = ref(false)

const canDeleteLine = can('deleteLine')
const canUpdateLine = can('updateLine')
const canCreateLine = can('createLine')
const canBulkLines = can('bulkLines')

const deletingResults = ref<ExtendedResult[]>()
const deleteLines = useAsyncAction(async () => {
  if (!deletingResults.value?.length) return
  await bulkLines(deletingResults.value.map(line => ({ _id: line._id, _action: 'delete' })))
  deleteSelectedResultsDialog.value = false
})

const showEditSelectedResultsDialog = useAsyncAction(async () => {
  editingLines.value = await $fetch<{ results: Record<string, any>[] }>(`datasets/${datasetId}/lines`, {
    params: {
      arrays: true,
      _id_in: selectedResults.value.map(r => r._id).join(','),
      limit: 10000
    }
  }).then(r => r.results)
  editSelectedResultsDialog.value = true
})

const editingLines = ref<Record<string, any>[]>()
const editSelectedResultsDialog = ref(false)
const editSelectedLinesForm = ref<VForm>()
const editSelectedLinesValid = ref(false)
const editingLinesPatch = ref({})
const saveLinesPatch = useAsyncAction(async () => {
  await editSelectedLinesForm.value?.validate()
  if (!editingLines.value?.length) return
  await bulkLines(editingLines.value.map(result => ({ ...editingLinesPatch.value, _id: result._id, _action: 'patch' })))
  editSelectedResultsDialog.value = false
})

const addLineDialog = ref(false)
const addLineValid = ref(false)
const addLineForm = ref<VForm>()
const newLine = ref({})
const file = ref<File>()
watch(addLineDialog, () => {
  if (!addLineDialog.value) return
  newLine.value = {}
  file.value = undefined
})
const addLine = useAsyncAction(async () => {
  await addLineForm.value?.validate()
  if (!addLineValid.value) return
  await saveLine(newLine.value, file.value)
  addLineDialog.value = false
})
</script>
