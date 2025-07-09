<template lang="html">
  <div v-if="application">
    <d-frame
      v-if="application.baseApp?.meta?.['df:vjsf'] === '3'"
      :src="`/data-fair/next-ui/embed/application/${$route.params.id}/config`"
      :height="`${windowHeight}px`"
      resize="no"
      sync-params
      @notif="(frameNotif) => emitNotification(frameNotif.detail)"
    />
    <lazy-application-config
      v-else
      :ro-dataset="$route.query.roDataset === 'true'"
    />
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex'

export default {
  computed: {
    ...mapState('application', ['application'])
  },
  methods: {
    ...mapActions(['emitNotification'])
  }
}
</script>

<style lang="css">
</style>
