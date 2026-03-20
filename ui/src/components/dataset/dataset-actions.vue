<template>
  <v-list
    v-if="dataset"
    density="compact"
    bg-color="background"
  >
    <template v-if="dataFiles.length">
      <v-list-subheader>{{ t('downloads') }}</v-list-subheader>
      <v-list-item
        v-for="dataFile in dataFiles"
        :key="dataFile.key"
        :disabled="!can('downloadFullData').value"
        :href="dataFile.url"
      >
        <template #prepend>
          <v-icon color="primary">
            mdi-file-download
          </v-icon>
        </template>
        <v-list-item-title>{{ dataFile.title }}</v-list-item-title>
      </v-list-item>
    </template>

    <dataset-upload-dialog
      v-if="can('writeData').value && !dataset.isRest && !dataset.isVirtual && !dataset.isMetaOnly"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon color="primary">
              mdi-file-upload
            </v-icon>
          </template>
          <v-list-item-title>{{ t('updateFile') }}</v-list-item-title>
        </v-list-item>
      </template>
    </dataset-upload-dialog>

    <v-list-subheader>{{ t('actions') }}</v-list-subheader>

    <v-list-item
      v-if="can('writeDescription').value"
      :to="`/dataset/${dataset.id}/edit-metadata`"
    >
      <template #prepend>
        <v-icon color="primary">
          mdi-pencil
        </v-icon>
      </template>
      <v-list-item-title>{{ t('editMetadata') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('readLines').value && dataset.finalizedAt && !dataset.isMetaOnly"
      :to="`/dataset/${dataset.id}/data`"
    >
      <template #prepend>
        <v-icon color="primary">
          mdi-table
        </v-icon>
      </template>
      <v-list-item-title>{{ t('viewData') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="dataset.isRest && can('createLine').value"
      :to="`/dataset/${dataset.id}/edit-data`"
    >
      <template #prepend>
        <v-icon color="primary">
          mdi-table-edit
        </v-icon>
      </template>
      <v-list-item-title>{{ t('editData') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('readApiDoc').value && dataset.finalizedAt"
      :to="`/dataset/${dataset.id}/api-doc`"
    >
      <template #prepend>
        <v-icon color="primary">
          mdi-cloud
        </v-icon>
      </template>
      <v-list-item-title>{{ t('useAPI') }}</v-list-item-title>
    </v-list-item>

    <integration-dialog
      v-if="dataset.finalizedAt"
      resource-type="datasets"
      :resource="dataset"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon color="primary">
              mdi-code-tags
            </v-icon>
          </template>
          <v-list-item-title>{{ t('integration') }}</v-list-item-title>
        </v-list-item>
      </template>
    </integration-dialog>

    <owner-change-dialog
      v-if="can('setOwner').value"
      :resource="dataset"
      resource-type="datasets"
      @changed="router.push('/datasets')"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon color="admin">
              mdi-account-switch
            </v-icon>
          </template>
          <v-list-item-title>{{ t('changeOwner') }}</v-list-item-title>
        </v-list-item>
      </template>
    </owner-change-dialog>

    <v-list-item
      v-if="can('delete').value"
      @click="showDeleteDialog = true"
    >
      <template #prepend>
        <v-icon color="warning">
          mdi-delete
        </v-icon>
      </template>
      <v-list-item-title>{{ t('delete') }}</v-list-item-title>
    </v-list-item>
  </v-list>

  <v-dialog
    v-model="showDeleteDialog"
    max-width="500"
  >
    <v-card>
      <v-card-title>{{ t('deleteDataset') }}</v-card-title>
      <v-card-text>{{ t('deleteMsg', { title: dataset?.title }) }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showDeleteDialog = false"
        >
          {{ t('no') }}
        </v-btn>
        <v-btn
          color="warning"
          @click="confirmRemove"
        >
          {{ t('yes') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  downloads: TÉLÉCHARGEMENTS
  updateFile: Mettre à jour le fichier
  actions: ACTIONS
  editMetadata: Éditer les métadonnées
  viewData: Voir les données
  editData: Éditer les données
  useAPI: Utiliser l'API
  integration: Intégrer dans un site
  changeOwner: Changer le propriétaire
  delete: Supprimer
  deleteDataset: Suppression du jeu de données
  deleteMsg: Voulez vous vraiment supprimer le jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  yes: Oui
  no: Non
en:
  downloads: DOWNLOADS
  updateFile: Update data file
  actions: ACTIONS
  editMetadata: Edit metadata
  viewData: View data
  editData: Edit data
  useAPI: Use the API
  integration: Embed in a website
  changeOwner: Change owner
  delete: Delete
  deleteDataset: Dataset deletion
  deleteMsg: Do you really want to delete the dataset "{title}" ? Deletion is definitive and data will not be recoverable.
  yes: Yes
  no: No
</i18n>

<script lang="ts" setup>
import useDatasetStore from '~/composables/dataset-store'

const { t } = useI18n()
const router = useRouter()
const { dataset, dataFiles, can, remove } = useDatasetStore()

const showDeleteDialog = ref(false)

const confirmRemove = async () => {
  showDeleteDialog.value = false
  await remove()
  router.push('/datasets')
}
</script>
