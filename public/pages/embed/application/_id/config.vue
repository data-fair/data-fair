<template lang="html">
  <application-config :ro-dataset="$route.query.roDataset === 'true'" data-iframe-height />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'

  global.iFrameResizer = {
    heightCalculationMethod: 'taggedElement',
  }

  export default {}
</script>

<style lang="css">
</style>
