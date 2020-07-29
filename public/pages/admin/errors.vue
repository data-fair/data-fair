<template lang="html">
  <v-container fluid>
    <p v-if="datasetsErrors && datasetsErrors.count === 0">
      Aucun jeu de données en erreur
    </p>
    <template v-else-if="datasetsErrors">
      <h3 class="title">
        Jeux de données en erreur
      </h3>
      <v-sheet
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list two-line>
          <v-list-item
            v-for="error in datasetsErrors.results"
            :key="error.id"
          >
            <v-list-item-content>
              <v-list-item-title>
                <nuxt-link :to="`/dataset/${error.id}/description`">
                  {{ error.title }} ({{ error.owner.name }})
                </nuxt-link>
              </v-list-item-title>
              <v-list-item-subtitle>{{ error.event.data }} ({{ error.event.date | moment("DD/MM/YYYY, HH:mm") }})</v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action>
              <v-btn
                icon
                color="primary"
                target="blank"
                @click="reindex(error.id)"
              >
                <v-icon>mdi-play</v-icon>
              </v-btn>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-sheet>
    </template>

    <p v-if="applicationsErrors && applicationsErrors.count === 0">
      Aucune application en erreur
    </p>
    <template v-else-if="applicationsErrors">
      <h3 class="title">
        Applications en erreur
      </h3>
      <v-card
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list two-line>
          <v-list-item
            v-for="error in applicationsErrors.results"
            :key="error.id"
          >
            <v-list-item-content>
              <v-list-item-title>
                <nuxt-link :to="`/application/${error.id}/description`">
                  {{ error.title }} ({{ error.owner.name }})
                </nuxt-link>
              </v-list-item-title>
              <v-list-item-subtitle>{{ error.event.data }} ({{ error.event.date | moment("DD/MM/YYYY, HH:mm") }})</v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card>
    </template>
  </v-container>
</template>

<script>
  export default {
    data() {
      return { datasetsErrors: null, applicationsErrors: null }
    },
    async mounted() {
      this.refresh()
    },
    methods: {
      async refresh() {
        this.datasetsErrors = await this.$axios.$get('api/v1/admin/datasets-errors', { params: { size: 1000 } })
        this.applicationsErrors = await this.$axios.$get('api/v1/admin/applications-errors', { params: { size: 1000 } })
      },
      async reindex(datasetId) {
        await this.$axios.$post(`api/v1/datasets/${datasetId}/_reindex`)
        this.refresh()
      },
    },
  }
</script>

<style lang="css">
</style>
