<template lang="html">
  <div data-iframe-height>
    <dataset-schema-view />
  </div>
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'

  global.iFrameResizer = {
    heightCalculationMethod: 'taggedElement',
  }

  export default {}
</script>
