<template lang="html">
  <v-container fluid>
    <remote-service-info />
    <remote-service-schema />
  </v-container>
</template>

<script>
  import RemoteServiceInfo from '~/components/remote-services/info.vue'
  import RemoteServiceSchema from '~/components/remote-services/schema.vue'

  export default {
    components: { RemoteServiceInfo, RemoteServiceSchema },
  }
</script>

<style lang="css">
</style>
