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
        {{ (error.response && error.response.data) || (error.i18n && $t(error.i18n)) || error.message || error }}
      </v-alert>
    </v-row>
  </div>
</template>

<i18n lang="yaml">
fr:
  authRequired: Vous devez être authentifié pour utiliser cette page.
  adminRequired: Cette page est réservée aux administrateurs.
en:
  authRequired: You must be logged in to use this page.
  adminRequired: This page is reserved for admins.
</i18n>

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
