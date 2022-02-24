<template>
  <v-list two-line>
    <template v-for="(dataset, i) in datasets">
      <v-list-item :key="`tile-${dataset.id}`">
        <v-list-item-content>
          <v-list-item-title>
            <a
              :href="dataset.page"
              target="_top"
            >{{ dataset.title || dataset.id }}</a>
            <span v-if="dataset.storage">({{ dataset.storage.size | displayBytes($i18n.locale) }})</span>
            <span v-else v-t="'noInfo'" />
          </v-list-item-title>
          <template v-if="dataset.storage">
            <v-list-item-subtitle v-if="dataset.storage.fileSize">
              {{ dataset.storage.fileSize | displayBytes($i18n.locale) }} {{ $t('files') }}
            </v-list-item-subtitle>
            <v-list-item-subtitle v-if="dataset.storage.attachmentsSize">
              {{ dataset.storage.attachmentsSize | displayBytes($i18n.locale) }} {{ $t('attachments') }}
            </v-list-item-subtitle>
            <v-list-item-subtitle v-if="dataset.storage.collectionSize">
              {{ dataset.storage.collectionSize | displayBytes($i18n.locale) }} {{ $t('db') }}
            </v-list-item-subtitle>
            <v-list-item-subtitle v-if="dataset.storage.revisionsSize">
              {{ dataset.storage.revisionsSize | displayBytes($i18n.locale) }} {{ $t('revisions') }}
            </v-list-item-subtitle>
            <v-list-item-subtitle v-if="dataset.storage.exportedSize">
              {{ dataset.storage.exportedSize | displayBytes($i18n.locale) }} {{ $t('exported') }}
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
  files: de fichier de données
  attachments: de pièces jointes
  db: de lignes en base de données
  revisions: de révisions historisées
  exported: de fichier exporté
en:
  noInfo: (no storage information)
  files: of data files
  attachments: of attachments
  db: of lines in database
  revisions: of revisions histories
  exported: of exported file

</i18n>

<script>

  import { mapState } from 'vuex'

  export default {
    props: ['datasets', 'urlTemplate'],
    computed: {
      ...mapState(['env']),
    },
    watch: {
      datasets() {
        this.datasets.forEach(dataset => {
          dataset.link = (this.urlTemplate || `${this.env.publicUrl}/dataset/{id}`).replace('{id}', dataset.id)
        })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
