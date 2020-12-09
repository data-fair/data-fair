<template>
  <nuxt-child v-if="dataset" />
</template>

<script>
  import { mapState } from 'vuex'

  export default {
    middleware: 'dynamic-theme',
    layout: 'embed',
    async fetch({ store, params, route }) {
      await store.dispatch('dataset/setId', route.params.id)
      await store.dispatch('fetchVocabulary', route.params.id)
    },
    computed: {
      ...mapState('dataset', ['dataset']),
    },
  }
</script>
