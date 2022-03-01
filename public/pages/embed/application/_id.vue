<template>
  <nuxt-child v-if="application" />
</template>

<script>
import { mapState } from 'vuex'

export default {
  layout: 'embed',
  async fetch ({ store, params, route }) {
    try {
      await store.dispatch('application/setId', route.params.id)
    } catch (err) {
      // in embed mode we prefer a blank page rather than showing an error
      console.error(err)
    }
  },
  computed: {
    ...mapState('application', ['application'])
  }
}
</script>
