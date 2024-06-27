<template>
  <nuxt-child v-if="dataset || jsonSchema" />
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
      let datasetId = route.params.id
      // manage case of application prefixed to dataset id in embed page
      const keys = datasetId.split(':')
      if (keys.length > 1) datasetId = keys[1]

      await store.dispatch('dataset/setId', { datasetId, html, fetchInfo: false })
      await Promise.all([
        store.dispatch('fetchVocabulary', datasetId),
        store.dispatch('dataset/fetchDataset')
      ])
    } catch (err) {
      if (err.response && err.response.status === 403 && route.path.endsWith('/form')) {
        store.dispatch('dataset/fetchJsonSchema', true)
      } else {
        // in embed mode we prefer a blank page rather than showing an error
        console.error(err)
      }
    }
  },
  computed: {
    ...mapState('dataset', ['dataset', 'jsonSchema'])
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
