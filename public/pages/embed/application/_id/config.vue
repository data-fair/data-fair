<template lang="html">
  <application-config :ro-dataset="$route.query.roDataset === 'true'" />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import ApplicationConfig from '~/components/applications/config.vue'

  export default {
    components: { ApplicationConfig },
  }
</script>

<style lang="css">
</style>
