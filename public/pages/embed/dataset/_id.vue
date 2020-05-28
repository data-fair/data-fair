<template>
  <nuxt-child v-if="dataset" />
</template>

<script>
  import { mapState, mapActions } from 'vuex'

  export default {
    layout: 'embed',
    async fetch({ store, params, route }) {
      await store.dispatch('dataset/setId', route.params.id)
      await store.dispatch('fetchVocabulary', route.params.id)
    },
    computed: {
      ...mapState('dataset', ['dataset']),
    },
    destroyed() {
      this.clear()
    },
    methods: {
      ...mapActions('dataset', ['clear']),
    },
  }
</script>
