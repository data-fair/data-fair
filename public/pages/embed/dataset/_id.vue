<template>
  <nuxt-child v-if="dataset"/>
</template>

<script>
import { mapState, mapActions } from 'vuex'

export default {
  layout: 'embed',
  created() {
    this.setId(this.$route.params.id)
    this.fetchVocabulary()
  },
  destroyed() {
    this.clear()
  },
  methods: {
    ...mapState('dataset', ['dataset']),
    ...mapActions(['fetchVocabulary']),
    ...mapActions('dataset', ['setId', 'clear'])
  }
}
</script>
