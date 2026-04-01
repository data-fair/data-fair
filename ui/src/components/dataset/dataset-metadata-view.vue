<template>
  <v-container
    v-if="dataset"
    fluid
    class="dataset-metadata-view pa-0 mb-4"
  >
    <v-row>
      <v-col
        cols="12"
        :md="dataset.image ? 8 : 12"
      >
        <div class="text-headline-large mb-2">
          {{ dataset.title }}
        </div>
        <p
          v-if="dataset.description"
          class="text-body-medium mb-4"
          v-html="dataset.description"
        />

        <v-list density="compact">
          <v-list-item
            v-if="dataset.owner"
            :prepend-icon="mdiAccount"
          >
            <v-list-item-title>{{ dataset.owner.name }}</v-list-item-title>
          </v-list-item>

          <v-list-item v-if="dataset.license">
            <template #prepend>
              <v-icon :icon="mdiLicense" />
            </template>
            <v-list-item-title>
              <a
                v-if="dataset.license.href"
                :href="dataset.license.href"
                target="_blank"
                rel="noopener"
              >{{ dataset.license.title || dataset.license.href }}</a>
              <span v-else>{{ dataset.license.title }}</span>
            </v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="dataset.updatedAt"
            :prepend-icon="mdiPencil"
          >
            <v-list-item-title>
              {{ t('metadataUpdated') }} — {{ dataset.updatedBy?.name }} {{ formatDate(dataset.updatedAt) }}
            </v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="dataset.dataUpdatedAt"
            :prepend-icon="dataset.isRest ? mdiPlaylistEdit : mdiUpload"
          >
            <v-list-item-title>
              {{ t('dataUpdated') }} — {{ dataset.dataUpdatedBy?.name }} {{ formatDate(dataset.dataUpdatedAt) }}
            </v-list-item-title>
          </v-list-item>

          <v-list-item :prepend-icon="mdiPlusCircleOutline">
            <v-list-item-title>
              {{ t('created') }} — {{ dataset.createdBy?.name }} {{ formatDate(dataset.createdAt) }}
            </v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="dataset.count != null"
            :prepend-icon="mdiCounter"
          >
            <v-list-item-title>{{ dataset.count.toLocaleString(locale) }} {{ t('records') }}</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="dataset.file"
            :prepend-icon="mdiFile"
          >
            <v-list-item-title>{{ (dataset.originalFile || dataset.file).name }} {{ formatBytes((dataset.originalFile || dataset.file).size, locale) }}</v-list-item-title>
          </v-list-item>

          <v-list-item
            v-if="nbVirtualDatasets > 0"
            :prepend-icon="mdiDatabaseArrowRight"
          >
            <v-list-item-title>
              <router-link :to="`/datasets?children=${dataset.id}`">
                {{ t('nbVirtualDatasets', nbVirtualDatasets) }}
              </router-link>
            </v-list-item-title>
          </v-list-item>

          <!-- REST dataset indicators -->
          <template v-if="dataset.isRest">
            <v-list-item :prepend-icon="mdiAllInclusive">
              <v-list-item-title>{{ t('restDataset') }}</v-list-item-title>
            </v-list-item>

            <v-list-item>
              <template #prepend>
                <v-icon
                  :color="dataset.rest?.history ? undefined : 'grey'"
                  :icon="mdiHistory"
                />
              </template>
              <v-list-item-title v-if="dataset.rest?.history">
                {{ t('history') }}
              </v-list-item-title>
              <v-list-item-title v-else>
                {{ t('noHistory') }}
              </v-list-item-title>
            </v-list-item>
          </template>

          <!-- Origin -->
          <v-list-item
            v-if="dataset.origin"
            :prepend-icon="mdiLink"
          >
            <v-list-item-title>{{ t('origin') }}: {{ dataset.origin }}</v-list-item-title>
          </v-list-item>

          <!-- Temporal coverage -->
          <v-list-item
            v-if="dataset.temporal"
            :prepend-icon="mdiCalendarRange"
          >
            <v-list-item-title>{{ t('temporal') }}: {{ formatTemporal(dataset.temporal) }}</v-list-item-title>
          </v-list-item>

          <!-- Spatial coverage -->
          <v-list-item
            v-if="dataset.spatial"
            :prepend-icon="mdiMapMarker"
          >
            <v-list-item-title>{{ t('spatial') }}: {{ dataset.spatial }}</v-list-item-title>
          </v-list-item>

          <!-- Frequency -->
          <v-list-item
            v-if="dataset.frequency"
            :prepend-icon="mdiUpdate"
          >
            <v-list-item-title>{{ t('frequency') }}: {{ t(`freq_${dataset.frequency}`) }}</v-list-item-title>
          </v-list-item>

          <!-- Creator / Producer -->
          <v-list-item
            v-if="dataset.creator"
            :prepend-icon="mdiAccountHardHat"
          >
            <v-list-item-title>{{ t('creator') }}: {{ dataset.creator }}</v-list-item-title>
          </v-list-item>

          <!-- Custom metadata fields -->
          <template v-if="datasetsMetadata?.custom?.length">
            <v-list-item
              v-for="cm of datasetsMetadata.custom.filter((c: any) => dataset?.customMetadata?.[c.key])"
              :key="cm.key"
              :prepend-icon="mdiTag"
            >
              <v-list-item-title>{{ cm.title }}: {{ dataset?.customMetadata?.[cm.key] }}</v-list-item-title>
            </v-list-item>
          </template>
        </v-list>

        <!-- Keywords and topics -->
        <div
          v-if="(dataset.keywords && dataset.keywords.length) || (dataset.topics && dataset.topics.length)"
          class="d-flex flex-wrap ga-1 mt-2"
        >
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
      </v-col>
      <v-col
        v-if="dataset.image"
        cols="12"
        md="4"
      >
        <v-img
          :src="dataset.image"
          max-height="200"
          cover
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  metadataUpdated: Métadonnées mises à jour
  dataUpdated: Données mises à jour
  created: Création
  records: enregistrements
  restDataset: Jeu de données éditable
  history: Historisation (conserve les révisions des lignes)
  noHistory: Pas d'historisation (ne conserve pas les révisions des lignes)
  origin: Provenance
  temporal: Couverture temporelle
  spatial: Couverture spatiale
  frequency: Fréquence de mise à jour
  freq_realtime: Temps réel
  freq_daily: Quotidienne
  freq_weekly: Hebdomadaire
  freq_monthly: Mensuelle
  freq_quarterly: Trimestrielle
  freq_yearly: Annuelle
  freq_irregular: Irrégulière
  creator: Producteur
  nbVirtualDatasets: aucun jeu virtuel | 1 jeu de données virtuel | {count} jeux de données virtuels
en:
  metadataUpdated: Metadata updated
  dataUpdated: Data updated
  created: Created
  records: records
  restDataset: Editable dataset
  history: History (store revisions of lines)
  noHistory: No history configured (do not store revisions of lines)
  origin: Origin
  temporal: Temporal coverage
  spatial: Spatial coverage
  frequency: Update frequency
  freq_realtime: Real-time
  freq_daily: Daily
  freq_weekly: Weekly
  freq_monthly: Monthly
  freq_quarterly: Quarterly
  freq_yearly: Yearly
  freq_irregular: Irregular
  creator: Producer
  nbVirtualDatasets: no virtual dataset | 1 virtual dataset | {count} virtual datasets
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
