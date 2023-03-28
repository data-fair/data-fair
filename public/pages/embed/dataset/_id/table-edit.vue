<template lang="html">
  <v-container
    fluid
    class="pa-0 embed-table-edit"
    data-iframe-height
  >
    <dataset-table />
  </v-container>
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'

global.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

export default {
  mounted () {
    this.$store.dispatch('dataset/subscribe')
  }
}
</script>

<style>
</style>
