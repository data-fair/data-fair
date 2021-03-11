<template>
  <journal
    :journal="journal"
    type="dataset"
  />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  const { mapState } = require('vuex')

  export default {
    computed: {
      ...mapState('dataset', ['journal']),
    },
    mounted() {
      this.$store.dispatch('dataset/subscribe')
    },
  }
</script>
