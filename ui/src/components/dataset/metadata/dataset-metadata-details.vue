<template>
  <template v-if="dataset">
    <v-row density="compact">
      <v-col
        v-if="dataset.owner"
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item prepend-gap="28">
          <template #prepend>
            <df-owner-avatar
              :owner="dataset.owner"
              :show-tooltip="false"
            />
          </template>
          <div class="text-body-small text-medium-emphasis">
            {{ t('owner') }}
          </div>
          <div>
            {{ dataset.owner.name }}<template v-if="dataset.owner.department">
              - {{ dataset.owner.departmentName || dataset.owner.department }}
            </template>
          </div>
        </v-list-item>
      </v-col>

      <v-col
        v-if="dataset.count != null"
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item :prepend-icon="mdiCounter">
          <div class="text-body-small text-medium-emphasis">
            {{ t('size') }}
          </div>
          <div>{{ dataset.count.toLocaleString(locale) }} {{ t('records') }}</div>
        </v-list-item>
      </v-col>

      <v-col
        v-if="dataset.file"
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item :prepend-icon="mdiFile">
          <div class="text-body-small text-medium-emphasis">
            {{ t('file') }}
          </div>
          <div>{{ (dataset.originalFile || dataset.file).name }} {{ formatBytes((dataset.originalFile || dataset.file).size, locale) }}</div>
        </v-list-item>
      </v-col>

      <v-col
        v-if="dataset.dataUpdatedAt"
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item :prepend-icon="dataset.isRest ? mdiPlaylistEdit : mdiUpload">
          <div class="text-body-small text-medium-emphasis">
            {{ t('dataUpdated') }}
          </div>
          <div>{{ formatDate(dataset.dataUpdatedAt) }}</div>
        </v-list-item>
      </v-col>

      <v-col
        v-if="dataset.updatedAt"
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item :prepend-icon="mdiPencil">
          <div class="text-body-small text-medium-emphasis">
            {{ t('metadataUpdated') }}
          </div>
          <div>{{ formatDate(dataset.updatedAt) }}</div>
        </v-list-item>
      </v-col>

      <v-col
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item :prepend-icon="mdiPlusCircleOutline">
          <div class="text-body-small text-medium-emphasis">
            {{ t('created') }}
          </div>
          <div>{{ formatDate(dataset.createdAt) }}</div>
        </v-list-item>
      </v-col>

      <!-- Completeness -->
      <v-col
        v-if="dataset.completeness"
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item :prepend-icon="mdiClipboardCheckOutline">
          <div class="text-body-small text-medium-emphasis">
            {{ t('completeness') }}
          </div>
          <v-tooltip location="bottom">
            <template #activator="{ props: tooltipProps }">
              <div
                v-bind="tooltipProps"
                class="d-flex align-center"
              >
                <v-progress-linear
                  :model-value="dataset.completeness.score"
                  color="primary"
                  class="flex-grow-1"
                  rounded
                  height="6"
                />
                <span class="text-caption text-medium-emphasis ml-2">{{ dataset.completeness.score }}&nbsp;%</span>
              </div>
            </template>
            <template v-if="!completenessLines.length">
              {{ t('completenessFull') }}
            </template>
            <template v-else>
              {{ t('completenessMissing') }}
              <div
                v-for="line of completenessLines"
                :key="line"
              >
                • {{ line }}
              </div>
            </template>
          </v-tooltip>
        </v-list-item>
      </v-col>

      <template v-if="dataset.isRest">
        <v-col
          cols="12"
          md="6"
          lg="4"
        >
          <v-list-item :prepend-icon="mdiAllInclusive">
            <div class="text-body-small text-medium-emphasis">
              {{ t('typeLabel') }}
            </div>
            <div>{{ t('restDataset') }}</div>
          </v-list-item>
        </v-col>

        <v-col
          cols="12"
          md="6"
          lg="4"
        >
          <v-list-item :prepend-icon="mdiHistory">
            <div class="text-body-small text-medium-emphasis">
              {{ t('historyLabel') }}
            </div>
            <div>{{ dataset.rest?.history ? t('history') : t('noHistory') }}</div>
          </v-list-item>
        </v-col>
      </template>

      <v-col
        v-if="nbVirtualDatasets > 0"
        cols="12"
        md="6"
        lg="4"
      >
        <v-list-item :prepend-icon="mdiPictureInPictureBottomRightOutline">
          <div class="text-body-small text-medium-emphasis">
            {{ t('virtualDatasetsLabel') }}
          </div>
          <div>
            <router-link :to="`/datasets?children=${dataset.id}`">
              {{ t('nbVirtualDatasets', nbVirtualDatasets) }}
            </router-link>
          </div>
        </v-list-item>
      </v-col>
    </v-row>
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
  completeness: Complétude des métadonnées
  completenessFull: Toutes les métadonnées proposées sont renseignées
  completenessMissing: 'Non renseigné :'
  completenessFields:
    description: description
    summary: résumé
    license: licence
    keywords: mots clés
    topics: thématiques
    creator: créateur
    origin: provenance
    frequency: fréquence de mise à jour
    spatial: couverture spatiale
    temporal: couverture temporelle
    conformsTo: schéma
  completenessLength:
    description:
      short: description trop courte ({count} caractères, minimum {min})
      long: description trop longue ({count} caractères, maximum {max})
    summary:
      short: résumé trop court ({count} caractères, minimum {min})
      long: résumé trop long ({count} caractères, maximum {max})
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
  completeness: Metadata completeness
  completenessFull: Every offered metadata field is filled
  completenessMissing: 'Not filled:'
  completenessFields:
    description: description
    summary: summary
    license: license
    keywords: keywords
    topics: topics
    creator: creator
    origin: origin
    frequency: update frequency
    spatial: spatial coverage
    temporal: temporal coverage
    conformsTo: schema
  completenessLength:
    description:
      short: description too short ({count} characters, minimum {min})
      long: description too long ({count} characters, maximum {max})
    summary:
      short: summary too short ({count} characters, minimum {min})
      long: summary too long ({count} characters, maximum {max})
</i18n>

<script setup lang="ts">
import {
  mdiAllInclusive,
  mdiClipboardCheckOutline,
  mdiCounter,
  mdiFile,
  mdiHistory,
  mdiPencil,
  mdiPictureInPictureBottomRightOutline,
  mdiPlaylistEdit,
  mdiPlusCircleOutline,
  mdiUpload
} from '@mdi/js'
import formatBytes from '@data-fair/lib-vue/format/bytes'
import useLocaleDayjs from '@data-fair/lib-vue/locale-dayjs.js'
import useDatasetStore from '~/composables/dataset/dataset-store'

const { dataset, nbVirtualDatasets } = useDatasetStore()

const { t, locale } = useI18n()
const { dayjs } = useLocaleDayjs()

const formatDate = (dateStr?: string) => {
  if (!dateStr) return ''
  return dayjs(dateStr).format('lll')
}

/**
 * One line per unfilled criterion. The two text criteria say why they do not count — a description
 * held back by its length is not the same problem as a missing one, and only the second is solved by
 * writing anything at all. The window comes from the dataset's own `completeness.lengths`, so the
 * tooltip still reads no settings.
 */
const completenessLines = computed(() => {
  const completeness = dataset.value?.completeness
  return (completeness?.missing ?? []).map((key: string) => {
    const window = completeness?.lengths?.[key as 'description' | 'summary']
    const count = ((dataset.value as any)?.[key] ?? '').trim().length
    if (!window || !count) return t('completenessFields.' + key)
    return count < window.min
      ? t(`completenessLength.${key}.short`, { count, min: window.min })
      : t(`completenessLength.${key}.long`, { count, max: window.max })
  })
})
</script>
