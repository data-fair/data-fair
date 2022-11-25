<template>
  <dashboard-metric
    :value="nbDatasets"
    :title="$tc('requestedPublications', nbDatasets)"
    :to="{name: 'datasets', query: {requestedPublicationSites: requestedPublicationSitesFacet && requestedPublicationSitesFacet.map(f => f.value).join(',')}}"
  />
</template>

<i18n lang="yaml">
fr:
  requestedPublications: Publication à valider | Publication à valider | Publications à valider
en:
  requestedPublications: Requested publication | Requested publication | Requested publications
</i18n>

<script>

const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      nbDatasets: null,
      requestedPublicationSitesFacet: null
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
            params: { size: 0, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, requestedPublicationSites: this.publicationSitesFilter, facets: 'requestedPublicationSites' }
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
