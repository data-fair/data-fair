<template>
  <nuxt-child v-if="application" />
</template>

<script>
  import { mapState, mapActions } from 'vuex'

  export default {
    layout: 'embed',
    async fetch({ store, params, route }) {
      await store.dispatch('application/setId', route.params.id)
    },
    computed: {
      ...mapState('application', ['application']),
    },
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions('application', ['clear']),
    },
  }
</script>
