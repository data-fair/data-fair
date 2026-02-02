<template>
  <v-list lines="two">
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
          <span v-if="dataset.storage?.indexed?.size"> - <b>{{ formatBytes(dataset.storage.indexed.size, locale) }}</b> de données indexées</span>
          <span v-if="dataset.storage?.size"> - <b>{{ formatBytes(dataset.storage.size, locale) }}</b> de données stockées</span>
          <span
            v-if="!dataset.storage"
            v-t="'noInfo'"
          />
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
              >({{ t('indexed') }})</span>
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
  original-file: fichier original
  normalized-file: fichier converti
  full-file: fichier enrichi
  export-csv-file: fichier exporté
  attachments: de pièces jointes
  metadata-attachments: pièces jointes aux méta-données
  collection: lignes en base de données
  revisions: révisions historisées
  master-data: d'équivalence en données de référence
  indexed: indexé
en:
  noInfo: (no storage information)
  original-file: original file
  normalized-file: converted file
  full-file: extended file
  export-csv-file: exported file
  attachments: attachments
  collection: lines in database
  revisions: revisions
  master-data: equivalence in master data
  indexed: indexed

</i18n>

<script lang="ts" setup>
import type { Dataset } from '#api/types'

const { t, locale } = useI18n()

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
      storageParts: storageParts.filter(sp => !!sp.size)
    }
  })
})
</script>

<style lang="css" scoped>
</style>
