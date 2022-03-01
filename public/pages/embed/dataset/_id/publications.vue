<template lang="html">
  <dataset-catalog-publications data-iframe-height />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'

global.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

export default {
  components: {}
}

</script>

<style lang="css">
</style>
