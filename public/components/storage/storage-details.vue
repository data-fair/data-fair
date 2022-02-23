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
          </v-list-item-title>
          <template v-if="dataset.storage">
            <v-list-item-subtitle v-if="dataset.storage">
              <b>{{ dataset.storage.staticSize | displayBytes($i18n.locale) }} {{ $t('static') }} :</b>
              <template v-for="(part, i) in dataset.storage.staticParts">
                <span :key="'static-size-part-' + i">{{ $t(part.name) }} ({{ part.size | displayBytes($i18n.locale) }})</span>
                <span v-if="i < dataset.storage.staticParts.length - 1" :key="'static-size-sep-' + i"> - </span>
              </template>
            </v-list-item-subtitle>
            <v-list-item-subtitle v-if="dataset.storage.dynamicSize">
              <b>{{ dataset.storage.dynamicSize | displayBytes($i18n.locale) }} {{ $t('dynamic') }} :</b>
              <template v-for="(part, i) in dataset.storage.dynamicParts">
                <span :key="'dynamic-size-part-' + i">{{ $t(part.name) }} ({{ part.size | displayBytes($i18n.locale) }})</span>
                <span v-if="i < dataset.storage.dynamicParts.length - 1" :key="'dynamic-size-sep-' + i"> - </span>
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
  static: de données statiques
  dynamic: de données dynamiques
  draft-files: fichiers brouillons
  attachments: fichiers joints
  metadata-attachments: pièces jointes aux métadonnées
  draft-index: index brouillon
  rest-lines: lignes de données
  rest-revisions: historique des lignes de données
en:
  static: of static data
  dynamic: of dynamic data
  draft-files: draft files
  attachments: attached files
  metadata-attachments: metadata attachments
  draft-index: draft index
  rest-lines: data lines
  rest-revisions: history of data lines
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
