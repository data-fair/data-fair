<template lang="html">
  <v-row>
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <p v-if="datasetsErrors && datasetsErrors.count === 0">
          Aucun jeu de données en erreur
        </p>
        <template v-else-if="datasetsErrors">
          <h3 class="text-h6">
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
                    <nuxt-link :to="`/dataset/${error.id}`">
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
                    title="reindex"
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
          <h3 class="text-h6">
            Applications en erreur
          </h3>
          <v-sheet
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
                    <nuxt-link :to="`/application/${error.id}`">
                      {{ error.title }} ({{ error.owner.name }})
                    </nuxt-link>
                  </v-list-item-title>
                  <v-list-item-subtitle>{{ error.errorMessage }} ({{ error.updatedAt | moment("DD/MM/YYYY, HH:mm") }})</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-sheet>
        </template>

        <p v-if="applicationsDraftErrors && applicationsDraftErrors.count === 0">
          Aucune application avec brouillon en erreur
        </p>
        <template v-else-if="applicationsDraftErrors">
          <h3 class="text-h6">
            Applications avec brouillon en erreur
          </h3>
          <v-sheet
            class="my-4"
            style="max-height:800px; overflow-y: scroll;"
          >
            <v-list two-line>
              <v-list-item
                v-for="error in applicationsDraftErrors.results"
                :key="error.id"
              >
                <v-list-item-content>
                  <v-list-item-title>
                    <nuxt-link :to="`/application/${error.id}`">
                      {{ error.title }} ({{ error.owner.name }})
                    </nuxt-link>
                  </v-list-item-title>
                  <v-list-item-subtitle>{{ error.errorMessageDraft }} ({{ error.updatedAt | moment("DD/MM/YYYY, HH:mm") }})</v-list-item-subtitle>
                </v-list-item-content>
              </v-list-item>
            </v-list>
          </v-sheet>
        </template>
      </v-container>
    </v-col>
  </v-row>
</template>

<script>
  export default {
    data() {
      return { datasetsErrors: null, applicationsErrors: null, applicationsDraftErrors: null }
    },
    async mounted() {
      this.refresh()
    },
    methods: {
      async refresh() {
        this.datasetsErrors = await this.$axios.$get('api/v1/admin/datasets-errors', { params: { size: 1000 } })
        this.applicationsErrors = await this.$axios.$get('api/v1/admin/applications-errors', { params: { size: 1000 } })
        this.applicationsDraftErrors = await this.$axios.$get('api/v1/admin/applications-draft-errors', { params: { size: 1000 } })
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
