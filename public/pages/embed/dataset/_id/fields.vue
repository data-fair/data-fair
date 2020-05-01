<template lang="html">
  <div>
    <dataset-schema-view />
  </div>
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import DatasetSchemaView from '../../../../components/datasets/schema-view.vue'

  export default {
    components: { DatasetSchemaView },
  }
</script>
