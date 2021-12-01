<template lang="html">
  <v-container fluid data-iframe-height>
    <settings-topics
      v-if="settings"
      :settings="settings"
      @updated="save"
    />
  </v-container>
</template>

<script>
  import 'iframe-resizer/js/iframeResizer.contentWindow'
  import eventBus from '~/event-bus'

  global.iFrameResizer = {
    heightCalculationMethod: 'taggedElement',
  }

  export default {
    layout: 'embed',
    data: () => ({
      api: null,
      settings: null,
      ready: false,
    }),
    async mounted() {
      this.settings = await this.$axios.$get('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id)
      this.$set(this.settings, 'topics', this.settings.topics || [])
    },
    methods: {
      async save() {
        try {
          this.settings = await this.$axios.$put('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id, this.settings)
          eventBus.$emit('notification', 'Les paramètres ont été mis à jour')
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour des paramètres' })
        }
      },
    },
  }
</script>

<style lang="css">
</style>
