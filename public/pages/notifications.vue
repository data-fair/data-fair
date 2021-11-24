<template>
  <v-container>
    <h2 v-if="activeAccount.type ==='organization'" class="mb-4">
      Vos notifications pour les événements de l'organisation {{ activeAccount.name }}
    </h2>
    <h2 v-else class="mb-4">
      Vos notifications pour les événements de votre compte personnel
    </h2>
    <v-iframe :src="`${env.notifyUrl}/embed/subscribe?key=${encodeURIComponent(keys)}&title=${encodeURIComponent(titles)}`" />
  </v-container>
</template>

<script>
  import { mapState, mapGetters } from 'vuex'
  import VIframe from '@koumoul/v-iframe'
  const webhooksSchema = require('~/../contract/settings').properties.webhooks

  export default {
    components: { VIframe },
    data: () => ({
      webhooksSchema,
    }),
    computed: {
      ...mapState(['env']),
      ...mapGetters('session', ['activeAccount']),
      keys() {
        return webhooksSchema.items.properties.events.items.oneOf.map(item => 'data-fair:' + item.const).join(',')
      },
      titles() {
        return webhooksSchema.items.properties.events.items.oneOf.map(item => `${item.title}`).join(',')
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
