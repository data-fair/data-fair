<template>
  <v-list two-line>
    <template v-for="(dataset, i) in fullDatasets">
      <v-list-item :key="`tile-${dataset.id}`">
        <v-list-item-content>
          <v-list-item-title>
            <a
              :href="dataset.page"
              target="_top"
            >{{ dataset.title || dataset.id }}</a>
            <span v-if="dataset.storage && dataset.storage.indexed"> - <b>{{ dataset.storage.indexed.size | bytes($i18n.locale) }}</b> de données indexées</span>
            <span v-if="dataset.storage"> - <b>{{ dataset.storage.size | bytes($i18n.locale) }}</b> de données stockées</span>
            <span
              v-if="!dataset.storage"
              v-t="'noInfo'"
            />
          </v-list-item-title>
          <template v-if="dataset.storage">
            <v-list-item-subtitle v-if="dataset.storageParts.length">
              <template v-for="(part, j) in dataset.storageParts">
                <span :key="'storage-part-' + j">{{ part.size | bytes($i18n.locale) }} {{ $t(part.key) }}</span>
                <span
                  v-if="part.indexed"
                  :key="'storage-part-indexed-' + j"
                >({{ $t('indexed') }})</span>
                <span
                  v-if="j < dataset.storageParts.length - 1"
                  :key="'storage-part-sep-' + j"
                > - </span>
              </template>
            </v-list-item-subtitle>
          </template>
        </v-list-item-content>
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

<script>

import { mapState } from 'vuex'

export default {
  props: ['datasets', 'urlTemplate'],
  computed: {
    ...mapState(['env']),
    fullDatasets () {
      return (this.datasets || []).filter(dataset => !!dataset.storage).map(dataset => {
        const storageParts = dataset.storage.dataFiles.map(df => ({ ...df, key: df.key + '-file' }))
        if (dataset.storage.attachments) storageParts.push({ key: 'attachments', size: dataset.storage.attachments.size })
        if (dataset.storage.metadataAttachments) storageParts.push({ key: 'metadata-attachments', size: dataset.storage.metadataAttachments.size })
        if (dataset.storage.collection) storageParts.push({ key: 'collection', size: dataset.storage.collection.size })
        if (dataset.storage.revisions) storageParts.push({ key: 'revisions', size: dataset.storage.revisions.size })
        if (dataset.storage.masterData) storageParts.push({ key: 'master-data', size: dataset.storage.masterData.size })
        storageParts.forEach(sp => {
          if (dataset.storage.indexed && dataset.storage.indexed.parts && dataset.storage.indexed.parts.includes(sp.key)) {
            sp.indexed = true
          }
        })
        return {
          ...dataset,
          link: (this.urlTemplate || `${this.env.publicUrl}/dataset/{id}`).replace('{id}', dataset.id).replace('{slug}', dataset.slug),
          storageParts: storageParts.filter(sp => !!sp.size)
        }
      })
    }
  }
}
</script>

<style lang="css" scoped>
</style>
