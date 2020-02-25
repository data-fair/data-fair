<template lang="html">
  <dataset-map :height-margin="0" :show-select="false" />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
import DatasetMap from '../../../../components/DatasetMap.vue'

export default {
  components: { DatasetMap }
}
</script>

<style lang="css">
</style>
