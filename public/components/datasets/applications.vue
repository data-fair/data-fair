<template>
  <v-row>
    <v-progress-linear v-if="!applications" :indeterminate="true" />
    <v-col
      v-for="app in applications"
      :key="app.id"
      cols="12"
      md="6"
      lg="4"
      xl="3"
    >
      <application-card
        :application="app"
        :hide-owner="true"
        :hide-description="true"
      />
    </v-col>
  </v-row>
</template>

<script>

  import { mapState } from 'vuex'
  import ApplicationCard from '~/components/applications/card.vue'

  export default {
    components: { ApplicationCard },
    computed: {
      ...mapState('dataset', ['applications']),
    },
  }
</script>

<style lang="css" scoped>
</style>
