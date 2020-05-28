<template lang="html">
  <thumbnails
    :init-rows-per-page="6"
    :hide-rows-per-page="true"
  />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import Thumbnails from '~/components/datasets/thumbnails.vue'
  export default {
    components: { Thumbnails },
  }
</script>

<style lang="css">
</style>
