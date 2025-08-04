<template lang="html">
  <div v-if="application">
    <d-frame
      v-if="baseAppDraft?.meta?.['df:vjsf'] === '3'"
      :src="`/data-fair/next-ui/embed/application/${$route.params.id}/config`"
      :height="`${windowHeight}px`"
      resize="no"
      sync-params
      @notif="emitFrameNotif"
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
    ...mapState('application', ['application']),
    baseAppDraft () {
      if (!this.application) return null
      return (this.application.baseAppDraft && Object.keys(this.application.baseAppDraft).length)
        ? this.application.baseAppDraft
        : this.application.baseApp
    }
  },
  methods: {
    ...mapActions(['emitFrameNotif'])
  }
}
</script>

<style lang="css">
</style>
