<template>
  <template v-if="dataset">
    <v-card>
      <v-list density="compact">
        <v-list-item
          v-if="dataset.owner"
          :prepend-icon="mdiAccount"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('owner') }}
          </div>
          <div>{{ dataset.owner.name }}</div>
        </v-list-item>

        <v-list-item
          v-if="dataset.count != null"
          :prepend-icon="mdiCounter"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('size') }}
          </div>
          <div>{{ dataset.count.toLocaleString(locale) }} {{ t('records') }}</div>
        </v-list-item>

        <v-list-item
          v-if="dataset.file"
          :prepend-icon="mdiFile"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('file') }}
          </div>
          <div>{{ (dataset.originalFile || dataset.file).name }} {{ formatBytes((dataset.originalFile || dataset.file).size, locale) }}</div>
        </v-list-item>

        <v-list-item
          v-if="dataset.dataUpdatedAt"
          :prepend-icon="dataset.isRest ? mdiPlaylistEdit : mdiUpload"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('dataUpdated') }}
          </div>
          <div>{{ dataset.dataUpdatedBy?.name }} {{ formatDate(dataset.dataUpdatedAt) }}</div>
        </v-list-item>

        <v-list-item
          v-if="dataset.updatedAt"
          :prepend-icon="mdiPencil"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('metadataUpdated') }}
          </div>
          <div>{{ dataset.updatedBy?.name }} {{ formatDate(dataset.updatedAt) }}</div>
        </v-list-item>

        <v-list-item :prepend-icon="mdiPlusCircleOutline">
          <div class="text-body-small text-medium-emphasis">
            {{ t('created') }}
          </div>
          <div>{{ dataset.createdBy?.name }} {{ formatDate(dataset.createdAt) }}</div>
        </v-list-item>

        <template v-if="dataset.isRest">
          <v-list-item :prepend-icon="mdiAllInclusive">
            <div class="text-body-small text-medium-emphasis">
              {{ t('typeLabel') }}
            </div>
            <div>{{ t('restDataset') }}</div>
          </v-list-item>

          <v-list-item :prepend-icon="mdiHistory">
            <div class="text-body-small text-medium-emphasis">
              {{ t('historyLabel') }}
            </div>
            <div>{{ dataset.rest?.history ? t('history') : t('noHistory') }}</div>
          </v-list-item>
        </template>

        <v-list-item
          v-if="nbVirtualDatasets > 0"
          :prepend-icon="mdiDatabaseArrowRight"
        >
          <div class="text-body-small text-medium-emphasis">
            {{ t('virtualDatasetsLabel') }}
          </div>
          <div>
            <router-link :to="`/datasets?children=${dataset.id}`">
              {{ t('nbVirtualDatasets', nbVirtualDatasets) }}
            </router-link>
          </div>
        </v-list-item>
      </v-list>
    </v-card>
  </template>
</template>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  size: Taille
  records: enregistrements
  file: Fichier
  dataUpdated: Données mises à jour
  metadataUpdated: Métadonnées mises à jour
  created: Création
  typeLabel: Type
  restDataset: Jeu de données éditable
  historyLabel: Historisation
  history: Activée (conserve les révisions des lignes)
  noHistory: Désactivée (ne conserve pas les révisions des lignes)
  virtualDatasetsLabel: Jeux de données virtuels
  nbVirtualDatasets: aucun jeu virtuel | 1 jeu de données virtuel | {count} jeux de données virtuels
en:
  owner: Owner
  size: Size
  records: records
  file: File
  dataUpdated: Data updated
  metadataUpdated: Metadata updated
  created: Created
  typeLabel: Type
  restDataset: Editable dataset
  historyLabel: History
  history: Enabled (stores revisions of lines)
  noHistory: Disabled (does not store revisions of lines)
  virtualDatasetsLabel: Virtual datasets
  nbVirtualDatasets: no virtual dataset | 1 virtual dataset | {count} virtual datasets
</i18n>

<script setup lang="ts">
import {
  mdiAccount,
  mdiAllInclusive,
  mdiCounter,
  mdiDatabaseArrowRight,
  mdiFile,
  mdiHistory,
  mdiPencil,
  mdiPlaylistEdit,
  mdiPlusCircleOutline,
  mdiUpload
} from '@mdi/js'
import formatBytes from '@data-fair/lib-vue/format/bytes'
import useDatasetStore from '~/composables/dataset/dataset-store'

const { dataset, nbVirtualDatasets } = useDatasetStore()

const { t, locale } = useI18n()

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}
</script>
