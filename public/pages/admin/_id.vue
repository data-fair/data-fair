<template>
  <v-layout column class="application">
    <v-tabs icons-and-text grow color="transparent" slider-color="primary" class="mb-3">
      <v-tab :nuxt="true" :to="`/admin/info`">
        Informations du service
        <v-icon>info</v-icon>
      </v-tab>
      <v-tab :nuxt="true" :to="`/admin/owners`">
        Propriétaires
        <v-icon>supervisor_account</v-icon>
      </v-tab>
      <v-tab :nuxt="true" :to="`/admin/errors`">
        Erreurs
        <v-icon>warning</v-icon>
      </v-tab>
      <v-tab :nuxt="true" :to="`/admin/base-apps`">
        Applications de base
        <v-icon>apps</v-icon>
      </v-tab>
    </v-tabs>

    <nuxt-child />

  </v-layout>
</template>

<script>
import { mapState } from 'vuex'

export default {
  data: () => ({}),
  computed: {
    ...mapState(['env'])
  },
  mounted() {},
  destroyed() {},
  methods: {}
}
</script>

<style>
</style>
