<template>
  <journal
    :journal="journal"
    type="dataset"
    data-iframe-height
  />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
const { mapState } = require('vuex')

global.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

export default {
  async fetch ({ store }) {
    try {
      await store.dispatch('dataset/fetchJournal')
    } catch (err) {
      // in embed mode we prefer a blank page rather than showing an error
      console.error(err)
    }
  },
  computed: {
    ...mapState('dataset', ['journal'])
  },
  mounted () {
    this.$store.dispatch('dataset/subscribe')
  }
}
</script>
