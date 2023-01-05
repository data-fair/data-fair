<template>
  <v-container fluid>
    <p
      v-if="!publicationSites || !publicationSites.length"
      v-t="'noPublicationSite'"
    />
    <template v-else>
      <p v-t="'publishThisApp'" />
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
                  v-if="application.owner.department"
                  class="mb-2"
                >
                  <span>{{ application.owner.name }}</span>
                  <span v-if="site.department"> - {{ site.departmentName || site.department }}</span>
                </v-list-item-subtitle>
                <v-list-item-subtitle
                  v-if="site.datasetUrlTemplate && application.publicationSites.includes(`${site.type}:${site.id}`)"
                  class="mb-2"
                >
                  <a :href="site.datasetUrlTemplate.replace('{id}', application.id)">
                    {{ site.datasetUrlTemplate.replace('{id}', application.id) }}
                  </a>
                </v-list-item-subtitle>
                <v-list-item-subtitle>
                  <v-row class="my-0">
                    <v-switch
                      hide-details
                      dense
                      :input-value="application.publicationSites.includes(`${site.type}:${site.id}`)"
                      :disabled="(!canPublish(site) && !(site.settings && site.settings.staging)) || !canRequestPublication(site)"
                      :label="$t('published')"
                      class="mt-0 ml-6"
                      @change="togglePublicationSites(site)"
                    />
                    <v-switch
                      v-if="application.owner.type === 'organization' && !(site.settings && site.settings.staging) && !application.publicationSites.includes(`${site.type}:${site.id}`)"
                      hide-details
                      dense
                      :input-value="application.requestedPublicationSites.includes(`${site.type}:${site.id}`)"
                      :disabled="application.publicationSites.includes(`${site.type}:${site.id}`) || canPublish(site) || !canRequestPublication(site)"
                      :label="$t('publicationRequested')"
                      class="mt-0 ml-6"
                      @change="toggleRequestedPublicationSites(site)"
                    />
                  </v-row>
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-card>
      </v-row>
      <v-row>
        <v-col class="px-0">
          <tutorial-alert id="app-share-prefer-large">
            {{ $t('preferLargeDisplayTutorial') }}
          </tutorial-alert>
          <v-switch
            :input-value="application.preferLargeDisplay"
            :label="$t('preferLargeDisplay')"
            class="mx-4"
            @change="value => patchAndCommit({preferLargeDisplay: value})"
          />
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noPublicationSite: Vous n'avez pas configuré de portail sur lequel publier cette application.
  publishThisApp: Publiez cette application sur un ou plusieurs de vos portails.
  preferLargeDisplay: privilégier un rendu large
  preferLargeDisplayTutorial: En cochant l'option ci-dessous vous indiquez aux portails que cette application est à afficher sur une largeur importante autant que possible. Ceci pourra changer l'affichage dans les pages des jeux de données ou les tableaux de bords par exemple.
  published: publié
  publicationRequested: publication demandée par un contributeur
en:
  noPublicationSite: You haven't configured a portal to publish this application on.
  publishThisApp: Publish this application on one or more of your portals.
  preferLargeDisplay: prefer a large display
  preferLargeDisplayTutorial: By checking the following option you indicate to the portals that this application should be rendered on a large section of page as much as possible. This will change the rendering in dataset pages and dashboards.
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
    ...mapState('application', ['application']),
    ...mapGetters('application', ['can']),
    ...mapGetters('session', ['activeAccount'])
  },
  methods: {
    ...mapActions('application', ['patch', 'patchAndCommit']),
    togglePublicationSites (site) {
      const siteKey = `${site.type}:${site.id}`
      if (this.application.publicationSites.includes(siteKey)) {
        this.application.publicationSites = this.application.publicationSites.filter(s => s !== siteKey)
      } else {
        this.application.publicationSites.push(siteKey)
        this.application.requestedPublicationSites = this.application.requestedPublicationSites.filter(s => s !== siteKey)
      }
      this.patch({ publicationSites: this.dataset.publicationSites, requestedPublicationSites: this.dataset.requestedPublicationSites })
    },
    toggleRequestedPublicationSites (site) {
      const siteKey = `${site.type}:${site.id}`
      if (this.application.requestedPublicationSites.includes(siteKey)) {
        this.application.requestedPublicationSites = this.application.requestedPublicationSites.filter(s => s !== siteKey)
      } else {
        this.application.requestedPublicationSites.push(siteKey)
      }
      this.patch({ requestedPublicationSites: this.application.requestedPublicationSites })
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
