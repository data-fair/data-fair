<template>
  <v-container fluid>
    <p
      v-if="!publicationSites || !publicationSites.length"
      v-t="'noPublicationSite'"
    />
    <template v-else>
      <p v-t="'publishThisDataset'" />
      <v-row class="px-2">
        <v-card
          tile
          outlined
          style="min-width: 400px;"
        >
          <v-list
            class="py-0"
            two-line
          >
            <v-list-item
              v-for="(site,i) in publicationSites"
              :key="i"
            >
              <v-list-item-action>
                <v-checkbox
                  :input-value="dataset.publicationSites.includes(`${site.type}:${site.id}`)"
                  :disabled="!can('writePublicationSites')"
                  @change="toggle(site)"
                />
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
                  <a
                    v-if="site.datasetUrlTemplate && dataset.publicationSites.includes(`${site.type}:${site.id}`)"
                    :href="site.datasetUrlTemplate.replace('{id}', dataset.id)"
                  >
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

<i18n lang="yaml">
fr:
  noPublicationSite: Vous n'avez pas configuré de portail sur lequel publier ce jeu de données.
  publishThisDataset: Publiez ce jeu de données sur un ou plusieurs de vos portails.
en:
  noPublicationSite: You haven't configured a portal to publish this dataset on.
  publishThisDataset: Publish this dataset on one or more of your portals.
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
export default {
  props: {
    publicationSites: {
      type: Array,
      default: () => []
    }
  },
  data: () => ({
    selected: []
  }),
  computed: {
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can'])
  },
  methods: {
    ...mapActions('dataset', ['patch']),
    toggle (site) {
      const key = `${site.type}:${site.id}`
      if (this.dataset.publicationSites.includes(key)) {
        this.dataset.publicationSites = this.dataset.publicationSites.filter(s => s !== key)
      } else {
        this.dataset.publicationSites.push(key)
      }
      this.patch({ publicationSites: this.dataset.publicationSites })
    }
  }
}
</script>

<style lang="css" scoped>
</style>
