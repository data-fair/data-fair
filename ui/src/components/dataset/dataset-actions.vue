<template>
  <template v-if="dataset">
    <template v-if="portalUrls.length">
      <v-list-subheader class="text-uppercase">
        {{ t('navigation') }}
      </v-list-subheader>

      <v-list-item
        v-for="portalUrl in portalUrls"
        :key="portalUrl.url"
        :href="portalUrl.url"
        target="_blank"
        link
      >
        <template #prepend>
          <v-icon
            color="primary"
            :icon="mdiWeb"
          />
        </template>
        {{ t('viewOnPortal', { title: portalUrl.title }) }}
      </v-list-item>
    </template>

    <template v-if="dataFiles.length">
      <v-list-subheader class="text-uppercase">
        {{ t('downloads') }}
      </v-list-subheader>
      <v-list-item
        v-for="dataFile in dataFiles"
        :key="dataFile.key"
        :disabled="!can('downloadFullData').value"
        :href="dataFile.url"
        link
      >
        <template #prepend>
          <v-icon
            :icon="mdiFileDownload"
            color="primary"
          />
        </template>
        {{ dataFile.title }}
      </v-list-item>
    </template>

    <v-list-item
      v-if="dataset.isRest && user?.adminMode"
      :href="resourceUrl + '/raw'"
      link
    >
      <template #prepend>
        <v-icon
          :icon="mdiProgressDownload"
          color="admin"
        />
      </template>
      {{ t('downloadRawRest') }}
      <v-list-item-subtitle>{{ t('downloadRawRestSubtitle') }}</v-list-item-subtitle>
    </v-list-item>

    <dataset-upload-dialog
      v-if="can('writeData').value && !dataset.isRest && !dataset.isVirtual && !dataset.isMetaOnly"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item
          v-bind="activatorProps"
          link
        >
          <template #prepend>
            <v-icon
              :icon="mdiFileUpload"
              color="primary"
            />
          </template>
          {{ t('updateFile') }}
        </v-list-item>
      </template>
    </dataset-upload-dialog>

    <v-list-subheader class="text-uppercase">
      {{ t('actions') }}
    </v-list-subheader>

    <v-list-item
      v-if="dataset.isRest && can('createLine').value"
      :to="`/dataset/${dataset.id}/edit-data`"
      link
    >
      <template #prepend>
        <v-icon
          :icon="mdiTableEdit"
          color="primary"
        />
      </template>
      {{ t('editData') }}
    </v-list-item>

    <v-list-item
      v-if="can('readApiDoc').value && dataset.finalizedAt"
      :to="`/dataset/${dataset.id}/api-doc`"
      link
    >
      <template #prepend>
        <v-icon
          :icon="mdiCloud"
          color="primary"
        />
      </template>
      {{ t('useAPI') }}
    </v-list-item>

    <owner-change-dialog
      v-if="can('setOwner').value"
      :resource="dataset"
      resource-type="datasets"
      @changed="router.push('/datasets')"
    >
      <template #activator="{ props: activatorProps }">
        <v-list-item
          v-bind="activatorProps"
          link
        >
          <template #prepend>
            <v-icon
              :icon="mdiAccountSwitch"
              color="admin"
            />
          </template>
          {{ t('changeOwner') }}
        </v-list-item>
      </template>
    </owner-change-dialog>

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
      {{ t('delete') }}
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
      {{ t('deleteAllLines') }}
    </v-list-item>
  </template>

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
          variant="flat"
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
          variant="flat"
          @click="confirmDeleteAllLines"
        >
          {{ t('yes') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  navigation: Navigation
  viewOnPortal: "Voir sur {title}"
  downloads: Téléchargements
  updateFile: Mettre à jour le fichier
  downloadRawRest: Export brut
  downloadRawRestSubtitle: Téléchargement de l'export brut des données originales (admin)
  actions: Actions
  editData: Éditer les données
  useAPI: Utiliser l'API
  changeOwner: Changer le propriétaire
  cancel: Annuler
  validate: Valider
  delete: Supprimer
  deleteAllLines: Supprimer toutes les lignes
  deleteAllLinesTitle: Suppression des lignes du jeu de données
  deleteAllLinesWarning: Voulez-vous vraiment supprimer toutes les lignes du jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  deleteDataset: Suppression du jeu de données
  deleteMsg: Voulez-vous vraiment supprimer le jeu de données "{title}" ? La suppression est définitive et les données ne pourront pas être récupérées.
  yes: Oui
  no: Non
en:
  navigation: Navigation
  viewOnPortal: "View on {title}"
  downloads: Downloads
  updateFile: Update data file
  downloadRawRest: Raw export
  downloadRawRestSubtitle: Download the raw export of original data (admin)
  actions: Actions
  editData: Edit data
  useAPI: Use the API
  changeOwner: Change owner
  cancel: Cancel
  validate: Validate
  delete: Delete
  deleteAllLines: Delete all lines
  deleteAllLinesTitle: Delete all the lines of the dataset
  deleteAllLinesWarning: Do you really want to delete all the lines of the dataset "{title}"? Deletion is permanent and data cannot be recovered.
  deleteDataset: Dataset deletion
  deleteMsg: Do you really want to delete the dataset "{title}"? Deletion is permanent and data cannot be recovered.
  yes: Yes
  no: No
</i18n>

<script setup lang="ts">
import {
  mdiAccountSwitch,
  mdiCloud,
  mdiDelete,
  mdiDeleteSweep,
  mdiFileDownload,
  mdiFileUpload,
  mdiProgressDownload,
  mdiTableEdit,
  mdiWeb
} from '@mdi/js'
import useDatasetStore from '~/composables/dataset/store'

const { t } = useI18n()
const router = useRouter()
const { dataset, dataFiles, can, remove, id, resourceUrl } = useDatasetStore()
const session = useSession()
const user = computed(() => session.state.user)

const owner = computed(() => dataset.value?.owner)
const publicationSitesFetch = useFetch<any[]>(() => {
  if (!owner.value) return null
  let path = `${$apiPath}/settings/${owner.value.type}/${owner.value.id}`
  if (owner.value.department) path += ':' + owner.value.department
  path += '/publication-sites'
  return path
}, { immediate: true })

const portalUrls = computed(() => {
  if (!dataset.value || !publicationSitesFetch.data.value) return []
  const published = dataset.value.publicationSites ?? []
  return publicationSitesFetch.data.value
    .filter((site: any) => site.datasetUrlTemplate && published.includes(`${site.type}:${site.id}`))
    .map((site: any) => ({
      title: site.title || site.url || site.id,
      url: site.datasetUrlTemplate.replace('{id}', dataset.value!.id).replace('{slug}', dataset.value!.slug ?? dataset.value!.id)
    }))
})

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
</script>
