<template>
  <nuxt-child v-if="dataset" />
</template>

<script>
import { mapState } from 'vuex'

function inIframe () {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
}

export default {
  layout: 'embed',
  async fetch ({ store, params, route }) {
    try {
      const html = route.path.endsWith('/fields') || route.path.endsWith('/table')
      await store.dispatch('dataset/setId', { datasetId: route.params.id, html, fetchInfo: false })
      await Promise.all([
        store.dispatch('fetchVocabulary', route.params.id),
        store.dispatch('dataset/fetchDataset')
      ])
    } catch (err) {
      // in embed mode we prefer a blank page rather than showing an error
      console.error(err)
    }
  },
  computed: {
    ...mapState('dataset', ['dataset'])
  },
  mounted () {
    // used to track the original referer in case of embeded pages
    if (inIframe() && document.referrer) {
      const refererDomain = new URL(document.referrer).hostname
      if (refererDomain !== window.location.hostname && refererDomain !== this.$route.query.referer) {
        this.$router.replace({ query: { ...this.$route.query, referer: refererDomain } })
      }
    }

    document.addEventListener('mouseleave', (e) => {
      const event = new MouseEvent('mouseup')
      document.dispatchEvent(event)
    })
  }
}
</script>
