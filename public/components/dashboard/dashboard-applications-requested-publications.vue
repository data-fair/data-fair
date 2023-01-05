<template>
  <!--<dashboard-metric
    :value="nbApplications"
    :title="$tc('requestedPublications', nbApplications)"
    :to="{name: 'applications', query: {requestedPublicationSites: requestedPublicationSitesFacet && requestedPublicationSitesFacet.map(f => f.value).join(',')}}"
  />-->

  <dashboard-svg-link
    :to="nbApplications ? {name: 'applications', query: {requestedPublicationSites: requestedPublicationSitesFacet && requestedPublicationSitesFacet.map(f => f.value).join(',')}} : null"
    :title="$tc('requestedPublications', nbApplications)"
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
      nbApplications: null,
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
          const res = (await this.$axios.$get('api/v1/applications', {
            params: { size: 0, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, requestedPublicationSites: this.publicationSitesFilter, facets: 'requestedPublicationSites' }
          }))

          this.nbApplications = res.count
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
