<template>
  <template v-if="dataset">
    <div class="text-headline-large mb-4">
      {{ dataset.title }}
    </div>
    <v-row>
      <!-- Left: image + description -->
      <v-col
        cols="12"
        md="6"
      >
        <v-img
          v-if="dataset.image"
          :src="dataset.image"
          max-height="250"
          cover
          class="mb-4"
        />
        <div
          v-if="dataset.description"
          class="text-break"
          v-html="/*eslint-disable-line vue/no-v-html*/dataset.description"
        />
      </v-col>

      <!-- Right: metadata card -->
      <v-col
        cols="12"
        md="6"
      >
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
              v-if="dataset.creator"
              :prepend-icon="mdiAccountHardHat"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('creator') }}
              </div>
              <div>{{ dataset.creator }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.license"
              :prepend-icon="mdiLicense"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('license') }}
              </div>
              <div>
                <a
                  v-if="dataset.license.href"
                  :href="dataset.license.href"
                  target="_blank"
                  rel="noopener"
                >{{ dataset.license.title || dataset.license.href }}</a>
                <span v-else>{{ dataset.license.title }}</span>
              </div>
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

            <v-list-item
              v-if="dataset.origin"
              :prepend-icon="mdiLink"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('origin') }}
              </div>
              <div>{{ dataset.origin }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.temporal"
              :prepend-icon="mdiCalendarRange"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('temporal') }}
              </div>
              <div>{{ formatTemporal(dataset.temporal) }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.spatial"
              :prepend-icon="mdiMapMarker"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('spatial') }}
              </div>
              <div>{{ dataset.spatial }}</div>
            </v-list-item>

            <v-list-item
              v-if="dataset.frequency"
              :prepend-icon="mdiUpdate"
            >
              <div class="text-body-small text-medium-emphasis">
                {{ t('frequency') }}
              </div>
              <div>{{ t(`freq_${dataset.frequency}`) }}</div>
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

            <template v-if="datasetsMetadata?.custom?.length">
              <v-list-item
                v-for="cm of datasetsMetadata.custom.filter((c: any) => dataset?.customMetadata?.[c.key])"
                :key="cm.key"
                :prepend-icon="mdiTag"
              >
                <div class="text-body-small text-medium-emphasis">
                  {{ cm.title }}
                </div>
                <div>{{ dataset?.customMetadata?.[cm.key] }}</div>
              </v-list-item>
            </template>
          </v-list>

          <template v-if="(dataset.keywords?.length) || (dataset.topics?.length)">
            <v-divider />
            <div class="d-flex flex-wrap ga-1 pa-3">
              <v-chip
                v-for="keyword in (dataset.keywords || [])"
                :key="keyword"
                size="small"
              >
                {{ keyword }}
              </v-chip>
              <v-chip
                v-for="topic in (dataset.topics || [])"
                :key="topic.id"
                size="small"
                color="primary"
                variant="outlined"
              >
                {{ topic.title }}
              </v-chip>
            </div>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </template>
</template>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  creator: Producteur
  license: Licence
  size: Taille
  records: enregistrements
  file: Fichier
  dataUpdated: Données mises à jour
  metadataUpdated: Métadonnées mises à jour
  created: Création
  origin: Provenance
  temporal: Couverture temporelle
  spatial: Couverture spatiale
  frequency: Fréquence de mise à jour
  typeLabel: Type
  restDataset: Jeu de données éditable
  historyLabel: Historisation
  history: Activée (conserve les révisions des lignes)
  noHistory: Désactivée (ne conserve pas les révisions des lignes)
  virtualDatasetsLabel: Jeux de données virtuels
  nbVirtualDatasets: aucun jeu virtuel | 1 jeu de données virtuel | {count} jeux de données virtuels
  freq_realtime: Temps réel
  freq_daily: Quotidienne
  freq_weekly: Hebdomadaire
  freq_monthly: Mensuelle
  freq_quarterly: Trimestrielle
  freq_yearly: Annuelle
  freq_irregular: Irrégulière
en:
  owner: Owner
  creator: Producer
  license: License
  size: Size
  records: records
  file: File
  dataUpdated: Data updated
  metadataUpdated: Metadata updated
  created: Created
  origin: Origin
  temporal: Temporal coverage
  spatial: Spatial coverage
  frequency: Update frequency
  typeLabel: Type
  restDataset: Editable dataset
  historyLabel: History
  history: Enabled (stores revisions of lines)
  noHistory: Disabled (does not store revisions of lines)
  virtualDatasetsLabel: Virtual datasets
  nbVirtualDatasets: no virtual dataset | 1 virtual dataset | {count} virtual datasets
  freq_realtime: Real-time
  freq_daily: Daily
  freq_weekly: Weekly
  freq_monthly: Monthly
  freq_quarterly: Quarterly
  freq_yearly: Yearly
  freq_irregular: Irregular
</i18n>

<script setup lang="ts">
import {
  mdiAccount,
  mdiAccountHardHat,
  mdiAllInclusive,
  mdiCalendarRange,
  mdiCounter,
  mdiDatabaseArrowRight,
  mdiFile,
  mdiHistory,
  mdiLicense,
  mdiLink,
  mdiMapMarker,
  mdiPencil,
  mdiPlaylistEdit,
  mdiPlusCircleOutline,
  mdiTag,
  mdiUpdate,
  mdiUpload
} from '@mdi/js'
import formatBytes from '@data-fair/lib-vue/format/bytes'
import useDatasetStore from '~/composables/dataset/store'
import { useDatasetsMetadata } from '~/composables/dataset/use-metadata'

const { dataset, nbVirtualDatasets } = useDatasetStore()

const { t, locale } = useI18n()

const owner = computed(() => dataset.value?.owner)
const { datasetsMetadata } = useDatasetsMetadata(owner)

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(locale.value, { dateStyle: 'medium' })
}

const formatTemporal = (temporal: any) => {
  if (!temporal) return ''
  const parts = []
  if (temporal.start) parts.push(formatDate(temporal.start))
  if (temporal.end) parts.push(formatDate(temporal.end))
  return parts.join(' — ')
}
</script>
