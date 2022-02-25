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
            <span v-if="dataset.storage"> - <b>{{ dataset.storage.size | displayBytes($i18n.locale) }}</b> de stockage</span>
            <span v-if="dataset.storage && dataset.storage.indexed"> - <b>{{ dataset.storage.indexed.size | displayBytes($i18n.locale) }}</b> de données indexées</span>
            <span v-if="!dataset.storage" v-t="'noInfo'" />
          </v-list-item-title>
          <template v-if="dataset.storage">
            <v-list-item-subtitle v-if="dataset.storageParts.length">
              <template v-for="(part, i) in dataset.storageParts">
                <span :key="'storage-part-' + i">{{ part.size | displayBytes($i18n.locale) }} {{ $t(part.key) }}</span>
                <span v-if="i < dataset.storageParts.length - 1" :key="'storage-part-sep-' + i"> - </span>
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
  original: fichier original
  normalized: fichier converti
  full: fichier enrichi
  export-csv: fichier exporté
  attachments: de pièces jointes
  metadata-attachments: pièces jointes aux méta-données
  collection: lignes en base de données
  revisions: révisions historisées

en:
  noInfo: (no storage information)
  original: original file
  normalized: converted file
  full: extended file
  export-csv: exported file
  attachments: attachments
  collection: lines in database
  revisions: revisions

</i18n>

<script>

  import { mapState } from 'vuex'

  export default {
    props: ['datasets', 'urlTemplate'],
    computed: {
      ...mapState(['env']),
      fullDatasets() {
        return (this.datasets || []).map(dataset => {
          const storageParts = [...dataset.storage.dataFiles]
          if (dataset.storage.attachments) storageParts.push({ key: 'attachments', size: dataset.storage.attachments.size })
          if (dataset.storage.metadataAttachments) storageParts.push({ key: 'metadata-attachments', size: dataset.storage.metadataAttachments.size })
          if (dataset.storage.collection) storageParts.push({ key: 'collection', size: dataset.storage.collection.size })
          if (dataset.storage.revisions) storageParts.push({ key: 'revisions', size: dataset.storage.revisions.size })
          return {
            ...dataset,
            link: (this.urlTemplate || `${this.env.publicUrl}/dataset/{id}`).replace('{id}', dataset.id),
            storageParts: storageParts.filter(sp => !!sp.size),
          }
        })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
