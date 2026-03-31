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
          <v-icon
            :icon="mdiFileDownload"
            color="primary"
          />
        </template>
        <v-list-item-title>{{ dataFile.title }}</v-list-item-title>
      </v-list-item>
    </template>

    <v-list-item
      v-if="dataset.isRest && user?.adminMode"
      :href="resourceUrl + '/raw'"
    >
      <template #prepend>
        <v-icon
          :icon="mdiProgressDownload"
          color="admin"
        />
      </template>
      <v-list-item-title>{{ t('downloadRawRest') }}</v-list-item-title>
      <v-list-item-subtitle>{{ t('downloadRawRestSubtitle') }}</v-list-item-subtitle>
    </v-list-item>

    <dataset-upload-dialog
      v-if="can('writeData').value && !dataset.isRest && !dataset.isVirtual && !dataset.isMetaOnly"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon
              :icon="mdiFileUpload"
              color="primary"
            />
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
        <v-icon
          :icon="mdiPencil"
          color="primary"
        />
      </template>
      <v-list-item-title>{{ t('editMetadata') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="dataset.isRest && can('createLine').value"
      :to="`/dataset/${dataset.id}/edit-data`"
    >
      <template #prepend>
        <v-icon
          :icon="mdiTableEdit"
          color="primary"
        />
      </template>
      <v-list-item-title>{{ t('editData') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('readApiDoc').value && dataset.finalizedAt"
      :to="`/dataset/${dataset.id}/api-doc`"
    >
      <template #prepend>
        <v-icon
          :icon="mdiCloud"
          color="primary"
        />
      </template>
      <v-list-item-title>{{ t('useAPI') }}</v-list-item-title>
    </v-list-item>

    <owner-change-dialog
      v-if="can('setOwner').value"
      :resource="dataset"
      resource-type="datasets"
      @changed="router.push('/datasets')"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item v-bind="activatorProps">
          <template #prepend>
            <v-icon
              :icon="mdiAccountSwitch"
              color="admin"
            />
          </template>
          <v-list-item-title>{{ t('changeOwner') }}</v-list-item-title>
        </v-list-item>
      </template>
    </owner-change-dialog>

    <v-list-item
      v-if="can('writeDescriptionBreaking').value"
      @click="showSlugDialog = true"
    >
      <template #prepend>
        <v-icon
          :icon="mdiPencilOutline"
          color="primary"
        />
      </template>
      <v-list-item-title>{{ t('editSlug') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="can('delete').value"
      @click="showDeleteDialog = true"
    >
      <template #prepend>
        <v-icon
          :icon="mdiDelete"
          color="warning"
        />
      </template>
      <v-list-item-title>{{ t('delete') }}</v-list-item-title>
    </v-list-item>

    <v-list-item
      v-if="dataset.isRest && can('deleteLine').value"
      @click="showDeleteAllLinesDialog = true"
    >
      <template #prepend>
        <v-icon
          :icon="mdiDeleteSweep"
          color="warning"
        />
      </template>
      <v-list-item-title>{{ t('deleteAllLines') }}</v-list-item-title>
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

  <v-dialog
    v-model="showDeleteAllLinesDialog"
    max-width="500"
  >
    <v-card>
      <v-card-title>{{ t('deleteAllLinesTitle') }}</v-card-title>
      <v-card-text>
        <v-alert
          type="error"
          variant="outlined"
        >
          {{ t('deleteAllLinesWarning', { title: dataset?.title }) }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showDeleteAllLinesDialog = false"
        >
          {{ t('no') }}
        </v-btn>
        <v-btn
          color="warning"
          @click="confirmDeleteAllLines"
        >
          {{ t('yes') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="showSlugDialog"
    max-width="500"
    @update:model-value="val => { if (val) newSlug = dataset?.slug ?? '' }"
  >
    <v-card>
      <v-card-title>{{ t('editSlug') }}</v-card-title>
      <v-card-text>
        <v-alert
          type="warning"
          variant="outlined"
          class="mb-4"
        >
          {{ t('slugWarning') }}
        </v-alert>
        <v-text-field
          v-model="newSlug"
          :label="t('newSlug')"
          variant="outlined"
          density="compact"
          hide-details
          :rules="[val => !!val, val => !!val?.match(slugRegex)]"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="showSlugDialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="warning"
          :disabled="newSlug === dataset?.slug || !newSlug || !newSlug.match(slugRegex)"
          @click="confirmSlug"
        >
          {{ t('validate') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  downloads: TÉLÉCHARGEMENTS
  updateFile: Mettre à jour le fichier
  downloadRawRest: Export brut
  downloadRawRestSubtitle: Téléchargement de l'export brut des données originales (admin)
  actions: ACTIONS
  editMetadata: Éditer les métadonnées
  editData: Éditer les données
  useAPI: Utiliser l'API
  changeOwner: Changer le propriétaire
  editSlug: Modifier l'identifiant
  slugWarning: Cet identifiant unique et lisible est utilisé dans les URLs de pages de portails, d'APIs de données, etc. Attention, si vous le modifiez vous pouvez casser des liens et des applications existantes.
  newSlug: Nouvel identifiant
  cancel: Annuler
  validate: Valider
  delete: Supprimer
  deleteAllLines: Supprimer toutes les lignes
  deleteAllLinesTitle: Suppression des lignes du jeu de données
  deleteAllLinesWarning: Voulez vous vraiment supprimer toutes les lignes du jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  deleteDataset: Suppression du jeu de données
  deleteMsg: Voulez vous vraiment supprimer le jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  yes: Oui
  no: Non
en:
  downloads: DOWNLOADS
  updateFile: Update data file
  downloadRawRest: Raw export
  downloadRawRestSubtitle: Download the raw export of original data (admin)
  actions: ACTIONS
  editMetadata: Edit metadata
  editData: Edit data
  useAPI: Use the API
  changeOwner: Change owner
  editSlug: Edit slug
  slugWarning: "This unique and readable id is used in portal pages URLs, data APIs, etc. Warning: if you modify it you can break existing links and applications."
  newSlug: New slug
  cancel: Cancel
  validate: Validate
  delete: Delete
  deleteAllLines: Delete all lines
  deleteAllLinesTitle: Delete all the lines of the dataset
  deleteAllLinesWarning: Do you really want to delete all the lines of the dataset "{title}" ? Deletion is definitive and data will not be recoverable.
  deleteDataset: Dataset deletion
  deleteMsg: Do you really want to delete the dataset "{title}" ? Deletion is definitive and data will not be recoverable.
  yes: Yes
  no: No
</i18n>

<script lang="ts" setup>
import {
  mdiAccountSwitch,
  mdiCloud,
  mdiDelete,
  mdiDeleteSweep,
  mdiFileDownload,
  mdiFileUpload,
  mdiPencil,
  mdiPencilOutline,
  mdiProgressDownload,
  mdiTableEdit
} from '@mdi/js'
import useDatasetStore from '~/composables/dataset/store'

const { t } = useI18n()
const router = useRouter()
const { dataset, dataFiles, can, remove, id, resourceUrl, patchDataset } = useDatasetStore()
const session = useSession()
const user = computed(() => session.state.user)

const showDeleteDialog = ref(false)
const showDeleteAllLinesDialog = ref(false)

const confirmRemove = async () => {
  showDeleteDialog.value = false
  await remove()
  router.push('/datasets')
}

const confirmDeleteAllLines = async () => {
  showDeleteAllLinesDialog.value = false
  await $fetch(`datasets/${id}/lines`, { method: 'DELETE' })
}

const slugRegex = /^[a-z0-9]{1}[a-z0-9_-]*[a-z0-9]{1}$/
const showSlugDialog = ref(false)
const newSlug = ref('')

const confirmSlug = async () => {
  showSlugDialog.value = false
  await patchDataset.execute({ slug: newSlug.value })
}
</script>
