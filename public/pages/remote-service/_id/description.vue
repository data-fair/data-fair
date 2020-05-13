<template lang="html">
  <v-container fluid>
    <remote-service-info />
    <remote-service-schema />
  </v-container>
</template>

<script>
  import RemoteServiceInfo from '~/components/RemoteServiceInfo.vue'
  import RemoteServiceSchema from '~/components/RemoteServiceSchema.vue'

  export default {
    components: { RemoteServiceInfo, RemoteServiceSchema },
  }
</script>

<style lang="css">
</style>
