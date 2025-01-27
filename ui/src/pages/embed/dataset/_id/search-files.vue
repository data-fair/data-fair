<template lang="html">
  <dataset-search-files
    :init-rows-per-page="4"
    :hide-rows-per-page="true"
    data-iframe-height
  />
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'

global.iFrameResizer = {
  heightCalculationMethod: 'taggedElement'
}

export default {}
</script>

<style lang="css">
</style>
