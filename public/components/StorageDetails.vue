<template>
  <v-card :loading="!datasets" tile>
    <v-list two-line>
      <template v-for="(dataset, i) in datasets">
        <v-list-tile :key="`tile-${dataset.id}`">
          <v-list-tile-content>
            <v-list-tile-title>
              <a :href="dataset.link" target="_top">{{ dataset.title || dataset.id }}</a> ({{ dataset.storage.size | displayBytes }})
            </v-list-tile-title>
            <v-list-tile-sub-title v-if="dataset.storage.fileSize">
              {{ dataset.storage.fileSize | displayBytes }} de fichier de données
            </v-list-tile-sub-title>
            <v-list-tile-sub-title v-if="dataset.storage.attachmentsSize">
              {{ dataset.storage.attachmentsSize | displayBytes }} de pièces jointes
            </v-list-tile-sub-title>
            <v-list-tile-sub-title v-if="dataset.storage.collectionSize">
              {{ dataset.storage.collectionSize | displayBytes }} de lignes en base de données
            </v-list-tile-sub-title>
            <v-list-tile-sub-title v-if="dataset.storage.revisionsSize">
              {{ dataset.storage.revisionsSize | displayBytes }} de révisions historisées
            </v-list-tile-sub-title>
          </v-list-tile-content>
        </v-list-tile>
        <v-divider v-if="i < datasets.length - 1" :key="`divider-${dataset.id}`" />
      </template>
    </v-list>
  </v-card>
</template>

<script>

import { mapState } from 'vuex'

export default {
  props: ['datasets', 'urlTemplate'],
  computed: {
    ...mapState(['env'])
  },
  watch: {
    datasets() {
      this.datasets.forEach(dataset => {
        dataset.link = (this.urlTemplate || `${this.env.publicUrl}/dataset/{id}/description`).replace('{id}', dataset.id)
      })
    }
  }
}
</script>

<style lang="css" scoped>
</style>
