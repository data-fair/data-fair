<template>
  <v-container fluid>
    <v-progress-linear
      v-if="!applications"
      :indeterminate="true"
      class="mb-2"
    />
    <template v-else>
      <p v-if="!applications.length" v-t="'noApp'" />
      <p v-else v-t="'reorder'" />
      <draggable
        :list="applications"
        :options="dragOptions"
        class="layout row wrap my-0"
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
      v-if="canContrib"
      v-t="'configureApp'"
      color="primary"
      :to="{path: '/new-application', query: {dataset: dataset.id}}"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noApp: Vous n'avez pas encore configuré de visualisation pour ce jeu de données. Seules les configurations validées apparaissent ici.
  reorder: Vous pouvez changer l'ordre des visualisations par glissé/déposé.
  configureApp: Configurer une visualisation
en:
  noApp: You haven't configured a visualization for this dataset yet. Only the validated configurations appear here.
  reorder: You can change the orger of the visualizations using drag and drop.
  configureApp: Configure a visualization
</i18n>

<script>

  import { mapState, mapGetters } from 'vuex'
  const Draggable = require('vuedraggable')

  export default {
    components: { Draggable },
    computed: {
      ...mapState('dataset', ['dataset', 'applications']),
      ...mapGetters(['canContrib']),
      dragOptions() {
        return {
          animation: 0,
          group: 'reuses',
          disabled: false, // TODO: based on permission
          ghostClass: 'ghost',
        }
      },
    },
    methods: {
      changeOrder(order) {
        const extras = this.dataset.extras || {}
        extras.reuses = this.applications.map(a => a.id)
        this.$store.dispatch('dataset/patchAndCommit', { extras })
      },
    },
  }
</script>

<style lang="css">
.ghost {
  opacity: 0.5;
  background: #c8ebfb;
}
</style>
