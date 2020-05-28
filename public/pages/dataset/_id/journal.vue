<template>
  <v-container>
    <journal
      :journal="journal"
      type="dataset"
    />
  </v-container>
</template>

<script>
  import Journal from '~/components/journal.vue'
  const { mapState } = require('vuex')

  export default {
    components: { Journal },
    computed: {
      ...mapState('dataset', ['journal']),
    },
  }
</script>
