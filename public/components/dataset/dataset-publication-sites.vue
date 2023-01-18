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
                  <a :href="site.url">{{ site.title || site.url || site.id }}</a>
                </v-list-item-title>
                <v-list-item-subtitle
                  v-if="dataset.owner.department"
                  class="mb-2"
                >
                  <span>{{ dataset.owner.name }}</span>
                  <span v-if="site.department"> - {{ site.departmentName || site.department }}</span>
                </v-list-item-subtitle>
                <v-list-item-subtitle
                  v-if="site.datasetUrlTemplate && dataset.publicationSites.includes(`${site.type}:${site.id}`)"
                  class="mb-2"
                >
                  <a :href="site.datasetUrlTemplate.replace('{id}', dataset.id)">
                    {{ site.datasetUrlTemplate.replace('{id}', dataset.id) }}
                  </a>
                </v-list-item-subtitle>
                <v-list-item-subtitle
                  v-if="hasWarning(site)"
                  class="warning--text"
                >
                  {{ $t('hasWarning') }}{{ sitesWarnings[`${site.type}:${site.id}`].map(w => $t('warning.' + w)).join(', ') }}
                </v-list-item-subtitle>
                <v-list-item-subtitle
                  v-if="sitesContribPermissionsRisk[`${site.type}:${site.id}`]"
                  class="warning--text"
                >
                  {{ $t('contribPermission') }}
                </v-list-item-subtitle>
                <v-list-item-subtitle>
                  <v-row class="my-0">
                    <v-switch
                      hide-details
                      dense
                      :input-value="dataset.publicationSites.includes(`${site.type}:${site.id}`)"
                      :disabled="((hasWarning(site) || sitesContribPermissionsRisk[`${site.type}:${site.id}`]) && !dataset.publicationSites.includes(`${site.type}:${site.id}`)) || (!canPublish(site) && !(site.settings && site.settings.staging)) || !canRequestPublication(site)"
                      :label="$t('published')"
                      class="mt-0 ml-6"
                      @change="togglePublicationSites(site)"
                    />
                    <v-switch
                      v-if="dataset.owner.type === 'organization' && !(site.settings && site.settings.staging) && !dataset.publicationSites.includes(`${site.type}:${site.id}`)"
                      hide-details
                      dense
                      :input-value="dataset.requestedPublicationSites.includes(`${site.type}:${site.id}`)"
                      :disabled="(hasWarning(site) && !dataset.requestedPublicationSites.includes(`${site.type}:${site.id}`)) || dataset.publicationSites.includes(`${site.type}:${site.id}`) || canPublish(site) || !canRequestPublication(site)"
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
    </template>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  noPublicationSite: Vous n'avez pas configuré de portail sur lequel publier ce jeu de données.
  publishThisDataset: Publiez ce jeu de données sur un ou plusieurs de vos portails.
  published: publié
  publicationRequested: publication demandée par un contributeur
  hasWarning: "métadonnées manquantes : "
  warning:
    title: titre
    description: description
    topics: thématique
    license: licence
    temporal: couverture temporelle
    spatial: couverture géographique
    keywords: mot clé
    frequency: fréquence des mises à jour
  contribPermission: permission trop large accordée aux contributeurs (risque de rupture de compatibilité)
en:
  noPublicationSite: You haven't configured a portal to publish this dataset on.
  publishThisDataset: Publish this dataset on one or more of your portals.
  published: published
  publicationRequested: publication requested by a contributor
  hasWarning: "missing metadata : "
  warning:
    title: title
    description: description
    topics: topic
    license: license
    temporal: temporal coverage
    smissingSpatial: spatial coverage
    keywords: keyword
    frequency: update frequency
  contribPermission: too broad permission granted to contribs (risk of compatibility breakage)
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import permissionsUtils from '~/assets/permissions-utils.js'

export default {
  props: {
    publicationSites: {
      type: Array,
      default: () => []
    },
    permissions: {
      type: Array,
      default: null
    }
  },
  data: () => ({
    selected: []
  }),
  computed: {
    ...mapState(['env']),
    ...mapGetters(['ownerPublicationSites']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['can', 'resourceUrl']),
    ...mapGetters('session', ['activeAccount']),
    settingsPublicationSites () {
      return this.ownerPublicationSites(this.dataset.owner)
    },
    sitesWarnings () {
      const sitesWarnings = {}
      for (const site of this.publicationSites) {
        const warnings = sitesWarnings[`${site.type}:${site.id}`] = []
        const siteSettings = this.settingsPublicationSites.find(s => s.type === site.type && s.id === site.id)
        const requiredMetadata = (siteSettings && siteSettings.settings && siteSettings.settings.datasetsRequiredMetadata) || []
        for (const m of requiredMetadata) {
          if (m === 'temporal') {
            if (!(this.dataset.temporal && this.dataset.temporal.start)) warnings.push(m)
          } else if (m === 'keywords') {
            if (!(this.dataset.keywords && this.dataset.keywords.length)) warnings.push(m)
          } else if (m === 'topics') {
            if (!(this.dataset.topics && this.dataset.topics.length)) warnings.push(m)
          } else if (m === 'title') {
            if (!(this.dataset.title && this.dataset.title.length > 3)) warnings.push(m)
          } else if (m === 'description') {
            if (!(this.dataset.description && this.dataset.description.length > 10)) warnings.push(m)
          } else {
            if (!this.dataset[m]) warnings.push(m)
          }
        }
      }
      return sitesWarnings
    },
    hasWarning () {
      return (site) => {
        return this.sitesWarnings[`${site.type}:${site.id}`] && this.sitesWarnings[`${site.type}:${site.id}`].length
      }
    },
    sitesContribPermissionsRisk () {
      const sitesContribPermissionsRisk = {}
      for (const site of this.publicationSites) {
        if (!(site.settings && site.settings.staging) && this.permissions && this.permissions.find(p => permissionsUtils.isContribWriteAllPermission(p, this.dataset))) {
          sitesContribPermissionsRisk[`${site.type}:${site.id}`] = true
        }
      }
      return sitesContribPermissionsRisk
    }
  },
  methods: {
    ...mapActions('dataset', ['patch']),
    togglePublicationSites (site) {
      const siteKey = `${site.type}:${site.id}`
      if (this.dataset.publicationSites.includes(siteKey)) {
        this.dataset.publicationSites = this.dataset.publicationSites.filter(s => s !== siteKey)
      } else {
        this.dataset.publicationSites.push(siteKey)
        this.dataset.requestedPublicationSites = this.dataset.requestedPublicationSites.filter(s => s !== siteKey)
      }
      this.patch({ publicationSites: this.dataset.publicationSites, requestedPublicationSites: this.dataset.requestedPublicationSites })
    },
    toggleRequestedPublicationSites (site) {
      const siteKey = `${site.type}:${site.id}`
      if (this.dataset.requestedPublicationSites.includes(siteKey)) {
        this.dataset.requestedPublicationSites = this.dataset.requestedPublicationSites.filter(s => s !== siteKey)
      } else {
        this.dataset.requestedPublicationSites.push(siteKey)
      }
      this.patch({ requestedPublicationSites: this.dataset.requestedPublicationSites })
    },
    canPublish (site) {
      const warnings = this.sitesWarnings[`${site.type}:${site.id}`]
      return warnings && warnings.length === 0 && this.can('writePublicationSites') && (!this.activeAccount.department || this.activeAccount.department === site.department)
    },
    canRequestPublication (site) {
      return this.can('writeDescription')
    }
  }
}
</script>

<style lang="css" scoped>
</style>
