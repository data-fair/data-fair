<template>
  <v-list
    lines="two"
    bg-color="background"
  >
    <template
      v-for="(dataset, i) in fullDatasets"
      :key="`tile-${dataset.id}`"
    >
      <v-list-item>
        <v-list-item-title>
          <a
            :href="`/data-fair/dataset/${dataset.id}`"
            target="_top"
            class="simple-link"
          >{{ dataset.title || dataset.id }}</a>
          <span v-if="dataset.storage?.indexed?.size"> - <b>{{ formatBytes(dataset.storage.indexed.size, locale) }}</b> {{ t('indexedData') }}
            <v-tooltip
              v-if="dataset.legacyIndexed"
              location="top"
              max-width="400"
            >
              <template #activator="{props}">
                <v-icon
                  v-bind="props"
                  size="small"
                  color="warning"
                >
                  {{ mdiProgressClock }}
                </v-icon>
              </template>
              {{ t('legacyIndexed') }}
            </v-tooltip>
          </span>
          <span v-if="dataset.storage?.size"> - <b>{{ formatBytes(dataset.storage.size, locale) }}</b> {{ t('storedData') }}</span>
          <span v-if="!dataset.storage">{{ t('noInfo') }}</span>
        </v-list-item-title>
        <template v-if="dataset.storage">
          <v-list-item-subtitle v-if="dataset.storageParts.length">
            <template
              v-for="(part, j) in dataset.storageParts"
              :key="'storage-part-' + j"
            >
              <span>{{ formatBytes(part.size!, locale) }} {{ t(part.key) }}</span>
              <span
                v-if="part.indexed"
                :key="'storage-part-indexed-' + j"
              > ({{ t('indexed') }})</span>
              <span
                v-if="j < dataset.storageParts.length - 1"
                :key="'storage-part-sep-' + j"
              > - </span>
            </template>
          </v-list-item-subtitle>
        </template>
      </v-list-item>
      <v-divider
        v-if="i < datasets.length - 1"
        :key="`divider-${dataset.id}`"
      />
    </template>
  </v-list>
</template>

<i18n lang="yaml">
fr:
  noInfo: (pas d'information de stockage)
  indexedData: de données indexées
  storedData: de données stockées
  original-file: fichier original
  normalized-file: fichier converti
  full-file: fichier enrichi
  lines: lignes indexées (équivalent CSV)
  export-csv-file: fichier exporté
  attachments: de pièces jointes
  metadata-attachments: pièces jointes aux méta-données
  collection: lignes en base de données
  revisions: révisions historisées
  master-data: d'équivalence en données de référence
  indexed: indexé
  legacyIndexed: La taille des données indexées de ce jeu de données est encore calculée par une ancienne méthode (taille physique du fichier ou de la collection). Elle sera remplacée par l'équivalent CSV des lignes indexées lors du prochain traitement complet du jeu de données.
en:
  noInfo: (no storage information)
  indexedData: of indexed data
  storedData: of stored data
  original-file: original file
  normalized-file: converted file
  full-file: extended file
  lines: indexed lines (CSV equivalent)
  export-csv-file: exported file
  attachments: attachments
  metadata-attachments: attachments to metadata
  collection: lines in database
  revisions: revisions
  master-data: equivalence in master data
  indexed: indexed
  legacyIndexed: This dataset's indexed size is still computed by a deprecated method (physical size of the file or database collection). It will be replaced by the CSV equivalent of the indexed lines after the next full processing of the dataset.

</i18n>

<script setup lang="ts">
import type { Dataset } from '#api/types'
import { mdiProgressClock } from '@mdi/js'

const { t, locale } = useI18n()

// parts pointing to a physical proxy = the dataset has not yet converged to the
// CSV-equivalent indexed metric ('lines'), see docs/architecture/storage-accounting.md
const legacyIndexedParts = ['original-file', 'normalized-file', 'full-file', 'collection']

const { datasets } = defineProps<{ datasets: Dataset[], }>()

const fullDatasets = computed(() => {
  return (datasets || []).filter(dataset => !!dataset.storage).map(dataset => {
    const storage = dataset.storage!
    const storageParts = (storage.dataFiles ?? []).map(df => ({ ...df, key: df.key + '-file', indexed: false }))
    if (storage.attachments) storageParts.push({ key: 'attachments', size: storage.attachments.size, indexed: false })
    if (storage.metadataAttachments) storageParts.push({ key: 'metadata-attachments', size: storage.metadataAttachments.size, indexed: false })
    if (storage.collection) storageParts.push({ key: 'collection', size: storage.collection.size, indexed: false })
    if (storage.revisions) storageParts.push({ key: 'revisions', size: storage.revisions.size, indexed: false })
    if (storage.masterData) storageParts.push({ key: 'master-data', size: storage.masterData.size, indexed: false })
    storageParts.forEach(sp => {
      if (storage.indexed && storage.indexed.parts && storage.indexed.parts.includes(sp.key as 'attachments')) {
        sp.indexed = true
      }
    })
    return {
      ...dataset,
      link: `/data-fair/dataset/${dataset.id}`,
      legacyIndexed: (storage.indexed?.parts ?? []).some(p => legacyIndexedParts.includes(p)),
      storageParts: storageParts.filter(sp => !!sp.size)
    }
  })
})
</script>

<style lang="css" scoped>
</style>
