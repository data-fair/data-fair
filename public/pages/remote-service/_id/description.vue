<template lang="html">
  <div>
    <remote-service-info />
    <remote-service-schema />
  </div>
</template>

<script>
import RemoteServiceInfo from '../../../components/RemoteServiceInfo.vue'
import RemoteServiceSchema from '../../../components/RemoteServiceSchema.vue'

export default {
  components: { RemoteServiceInfo, RemoteServiceSchema }
}
</script>

<style lang="css">
</style>
