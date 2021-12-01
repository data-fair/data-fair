<template lang="html">
  <dataset-schema data-iframe-height />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'

  global.iFrameResizer = {
    heightCalculationMethod: 'taggedElement',
  }

  export default {}
</script>
