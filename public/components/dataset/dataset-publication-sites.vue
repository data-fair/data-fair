<template>
  <v-container fluid>
    <p v-if="!publicationSites || !publicationSites.length">
      Vous n'avez pas configuré de portail sur lequel publier ce jeu de données.
    </p>
    <template v-else>
      <p>
        Publiez ce jeu de données sur un ou plusieurs de vos portails.
      </p>
      <v-row class="px-2">
        <v-card
          tile
          outlined
          style="min-width: 400px;width:"
        >
          <v-list class="py-0" two-line>
            <v-list-item
              v-for="(site,i) in publicationSites"
              :key="i"
            >
              <v-list-item-action>
                <v-checkbox :input-value="dataset.publicationSites.includes(`${site.type}:${site.id}`)" @change="toggle(site)" />
              </v-list-item-action>

              <v-list-item-content>
                <v-list-item-title>
                  <v-icon
                    v-if="site.private"
                    small
                    color="warning"
                  >
                    mdi-lock
                  </v-icon>
                  <a :href="site.url">{{ site.title || site.url || site.id }}</a>
                </v-list-item-title>
                <v-list-item-subtitle>
                  <a v-if="site.datasetUrlTemplate && dataset.publicationSites.includes(`${site.type}:${site.id}`)" :href="site.datasetUrlTemplate.replace('{id}', dataset.id)">
                    {{ site.datasetUrlTemplate.replace('{id}', dataset.id) }}
                  </a>
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-card>
      </v-row>
    </template>
  </v-container>
</template>

<script>
  import { mapState, mapActions } from 'vuex'
  export default {
    props: {
      publicationSites: {
        type: Array,
        default: () => [],
      },
    },
    data: () => ({
      selected: [],
    }),
    computed: {
      ...mapState('dataset', ['dataset']),
    },
    methods: {
      ...mapActions('dataset', ['patch']),
      toggle(site) {
        const key = `${site.type}:${site.id}`
        if (this.dataset.publicationSites.includes(key)) {
          this.dataset.publicationSites = this.dataset.publicationSites.filter(s => s !== key)
        } else {
          this.dataset.publicationSites.push(key)
        }
        this.patch({ publicationSites: this.dataset.publicationSites })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
