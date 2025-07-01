<template lang="html">
  <div v-if="application">
    <d-frame
      v-if="application.baseApp?.meta?.['df:vjsf'] === '3'"
      :src="`/data-fair/next-ui/embed/application/${$route.params.id}/config`"
      :height="`${windowHeight}px`"
      resize="no"
      sync-params
    />
    <lazy-application-config
      v-else
      :ro-dataset="$route.query.roDataset === 'true'"
    />
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  computed: {
    ...mapState('application', ['application'])
  }
}
</script>

<style lang="css">
</style>
