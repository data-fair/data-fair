<template>
  <nuxt-child v-if="dataset"/>
</template>

<script>
import { mapState, mapActions } from 'vuex'

export default {
  layout: 'embed',
  computed: {
    ...mapState('dataset', ['dataset'])
  },
  async fetch({ store, params, route }) {
    await store.dispatch('dataset/setId', route.params.id)
    await store.dispatch('fetchVocabulary', route.params.id)
  },
  destroyed() {
    this.clear()
  },
  methods: {
    ...mapActions(['fetchVocabulary']),
    ...mapActions('dataset', ['setId', 'clear'])
  }
}
</script>
