<template>
  <!--<dashboard-metric
    :value="nbDatasets"
    :title="$tc('requestedPublications', nbDatasets)"
    :to="{name: 'datasets', query: {requestedPublicationSites: requestedPublicationSitesFacet && requestedPublicationSitesFacet.map(f => f.value).join(',')}}"
  />-->

  <dashboard-svg-link
    :to="nbDatasets ? {name: 'datasets', query: {requestedPublicationSites: requestedPublicationSitesFacet && requestedPublicationSitesFacet.map(f => f.value).join(',')}} : null"
    :title="$tc('requestedPublications', nbDatasets)"
    :svg="$vuetify.breakpoint.smAndUp ? checklistSvg : ''"
  />
</template>

<i18n lang="yaml">
fr:
  requestedPublications: Aucune publication à valider | 1 publication à valider | {n} publications à valider
en:
  requestedPublications: No requested publication | 1 requested publication | {n} requested publications
</i18n>

<script>

const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      nbDatasets: null,
      requestedPublicationSitesFacet: null,
      checklistSvg: require('~/assets/svg/Checklist _Two Color.svg?raw')
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount']),
    ...mapGetters(['ownerPublicationSites']),
    publicationSites () {
      return this.ownerPublicationSites(this.activeAccount)
    },
    publicationSitesFilter () {
      return this.publicationSites && this.publicationSites.map(p => `${p.type}:${p.id}`).join(',')
    }
  },
  watch: {
    publicationSites: {
      async handler () {
        if (this.publicationSites) {
          const res = (await this.$axios.$get('api/v1/datasets', {
            params: { size: 0, shared: false, requestedPublicationSites: this.publicationSitesFilter, facets: 'requestedPublicationSites' }
          }))

          this.nbDatasets = res.count
          this.requestedPublicationSitesFacet = res.facets.requestedPublicationSites
        }
      },
      immediate: true
    }
  }
}
</script>

<style lang="css" scoped>
</style>
