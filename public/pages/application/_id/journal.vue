<template>
  <v-container>
    <journal
      :journal="journal"
      type="application"
    />
  </v-container>
</template>

<script>
  import Journal from '~/components/journal.vue'
  const { mapState } = require('vuex')

  export default {
    components: { Journal },
    computed: {
      ...mapState('application', ['journal']),
    },
  }
</script>
