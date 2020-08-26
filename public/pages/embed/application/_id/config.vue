<template lang="html">
  <application-config :ro-dataset="$route.query.roDataset === 'true'" />
</template>

<script>
  import ApplicationConfig from '~/components/applications/config.vue'

  export default {
    components: { ApplicationConfig },
  }
</script>

<style lang="css">
</style>
