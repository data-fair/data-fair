<template>
  <v-container fluid>
    <v-progress-linear
      v-if="!applications"
      :indeterminate="true"
      class="mb-2"
    />
    <template v-else>
      <p
        v-if="!applications.length"
        v-t="'noApp'"
      />
      <p
        v-else
        v-t="'reorder'"
      />
      <draggable
        :list="applications"
        class="layout row wrap my-0"
        :disabled="!canContribDep"
        ghost-class="application-ghost"
        @end="changeOrder"
      >
        <v-col
          v-for="app in applications"
          :key="app.id"
          cols="12"
          sm="12"
          md="6"
          lg="3"
          xl="2"
        >
          <application-card :application="app" />
        </v-col>
      </draggable>
    </template>
    <v-btn
      v-if="canContribDep"
      v-t="'configureApp'"
      color="primary"
      :to="{path: '/new-application', query: {dataset: dataset.id}}"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noApp: Vous n'avez pas encore configuré de application pour ce jeu de données. Seules les configurations validées apparaissent ici.
  reorder: Vous pouvez changer l'ordre des applications par glissé/déposé.
  configureApp: Configurer une application
en:
  noApp: You haven't configured a application for this dataset yet. Only the validated configurations appear here.
  reorder: You can change the orger of the applications using drag and drop.
  configureApp: Configure a application
</i18n>

<script>

import { mapState, mapGetters } from 'vuex'
const Draggable = require('vuedraggable')

export default {
  components: { Draggable },
  computed: {
    ...mapState('dataset', ['dataset', 'applications']),
    ...mapGetters(['canContribDep'])
  },
  methods: {
    changeOrder (order) {
      const extras = this.dataset.extras || {}
      extras.applications = this.applications.map(a => ({ id: a.id, updatedAt: a.updatedAt, publicationSites: a.publicationSites }))
      this.$store.dispatch('dataset/patchAndCommit', { extras })
    }
  }
}
</script>

<style lang="css">
.application-ghost {
  opacity: 0.5;
  background-color: #c8ebfb!important;
}
</style>
