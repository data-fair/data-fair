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
    heightCalculationMethod: 'taggedElement',
  }

  export default {
    computed: {
      ...mapState('dataset', ['journal']),
    },
    mounted() {
      this.$store.dispatch('dataset/subscribe')
    },
  }
</script>
