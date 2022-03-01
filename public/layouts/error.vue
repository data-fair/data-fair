<template>
  <div class="container">
    <v-row
      justify="center"
      class="mt-8"
    >
      <v-alert
        v-if="error.statusCode !== 401"
        type="error"
        style="display:inline-block"
        outlined
        border="left"
      >
        {{ (error.response && error.response.data) || error.message || error }}
      </v-alert>
    </v-row>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  props: ['error'],
  computed: {
    ...mapState('session', ['user'])
  },
  mounted () {
    if (this.error.statusCode === 401) this.$store.dispatch('session/login')
    if (!this.user && this.error.statusCode === 403) this.$store.dispatch('session/login')
  }
}
</script>
