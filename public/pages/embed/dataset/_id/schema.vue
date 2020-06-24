<template lang="html">
  <dataset-schema />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import DatasetSchema from '~/components/datasets/schema.vue'

  export default {
    components: { DatasetSchema },
  }
</script>
