<template lang="html">
  <v-container fluid>
    <settings-webhooks v-if="settings" :settings="settings" @webhook-updated="save" />
  </v-container>
</template>

<script>
import 'iframe-resizer/js/iframeResizer.contentWindow'
import SettingsWebhooks from '../../../../../components/SettingsWebhooks.vue'
import eventBus from '../../../../../event-bus'

export default {
  layout: 'embed',
  components: { SettingsWebhooks },
  data: () => ({
    api: null,
    settings: null,
    ready: false
  }),
  async mounted() {
    this.settings = await this.$axios.$get('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id)
    this.$set(this.settings, 'webhooks', this.settings.webhooks || [])
  },
  methods: {
    async save() {
      try {
        this.settings = await this.$axios.$put('api/v1/settings/' + this.$route.params.type + '/' + this.$route.params.id, this.settings)
        eventBus.$emit('notification', 'Les paramètres ont bien été mis à jour')
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la mise à jour des paramètres' })
      }
    }
  }
}
</script>

<style lang="css">
</style>
