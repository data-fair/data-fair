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
            three-line
          >
            <v-list-item
              v-for="(site,i) in publicationSites"
              :key="i"
            >
              <v-list-item-content style="overflow:visible;">
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
                <v-list-item-subtitle
                  v-if="site.datasetUrlTemplate && dataset.publicationSites.includes(`${site.type}:${site.id}`)"
                  class="mb-2"
                >
                  <a :href="site.datasetUrlTemplate.replace('{id}', dataset.id)">
                    {{ site.datasetUrlTemplate.replace('{id}', dataset.id) }}
                  </a>
                </v-list-item-subtitle>
                <v-list-item-subtitle style="overflow:visible;">
                  <v-row>
                    <v-switch
                      hide-details
                      dense
                      :input-value="dataset.publicationSites.includes(`${site.type}:${site.id}`)"
                      :disabled="!canPublish(site)"
                      :label="$t('published')"
                      class="mt-0 ml-6"
                      @change="toggle(site, 'publicationSites')"
                    />
                    <!--<v-switch
                      hide-details
                      dense
                      :input-value="dataset.requestedPublicationSites.includes(`${site.type}:${site.id}`)"
                      :disabled="dataset.publicationSites.includes(`${site.type}:${site.id}`) || canPublish(site) || !canRequestPublication(site)"
                      :label="$t('publicationRequested')"
                      class="mt-0 ml-6"
                      @change="toggle(site, 'requestedPublicationSites')"
                    />-->
                  </v-row>
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
  published: publié
  publicationRequested: publication demandée par un contributeur
en:
  noPublicationSite: You haven't configured a portal to publish this dataset on.
  publishThisDataset: Publish this dataset on one or more of your portals.
  published: published
  publicationRequested: publication requested by a contributor
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
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can']),
    ...mapGetters('session', ['activeAccount'])
  },
  methods: {
    ...mapActions('dataset', ['patch']),
    toggle (site, key) {
      const siteKey = `${site.type}:${site.id}`
      if (this.dataset[key].includes(siteKey)) {
        this.dataset[key] = this.dataset[key].filter(s => s !== siteKey)
      } else {
        this.dataset[key].push(siteKey)
      }
      this.patch({ [key]: this.dataset[key] })
    },
    async requestPublication (site) {
      this.requestedPublications.push(`${site.type}:${site.id}`)
      await this.$axios.$post(this.env.notifyUrl + '/api/v1/notifications', {
        sender: site.owner,
        topic: { id: `data-fair:dataset-publication-requested:${site.type}:${site.id}` },
        title: 'Hey publication demandée'
      })
    },
    canPublish (site) {
      return this.can('writePublicationSites') && (!this.activeAccount.department || this.activeAccount.department === site.department)
    },
    canRequestPublication (site) {
      return this.can('writeDescription')
    }
  }
}
</script>

<style lang="css" scoped>
</style>
