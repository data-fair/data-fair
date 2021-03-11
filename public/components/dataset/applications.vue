<template>
  <v-container fluid>
    <v-progress-linear
      v-if="!applications"
      :indeterminate="true"
      class="mb-2"
    />
    <template v-else>
      <p v-if="!applications.length">
        Vous n'avez pas encore configuré de visualisation pour ce jeu de données. Seules les configurations validées apparaissent ici.
      </p>
      <p v-else>
        Vous pouvez changer l'ordre des visualisations par glissé/déposé.
      </p>
      <draggable
        :list="applications"
        :options="dragOptions"
        class="layout row wrap"
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
      color="primary"
      :to="{path: '/new-application', query: {dataset: dataset.id}}"
    >
      Configurer une visualisation
    </v-btn>
  </v-container>
</template>

<script>

  import { mapState, mapGetters } from 'vuex'
  import ApplicationCard from '~/components/applications/card.vue'
  const Draggable = require('vuedraggable')

  export default {
    components: { ApplicationCard, Draggable },
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
