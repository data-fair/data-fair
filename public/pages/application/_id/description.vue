<template lang="html">
  <v-container>
    <v-text-field label="Titre" v-model="application.title" @blur="patch({title: application.title})"/>
    <v-textarea label="Description" v-model="application.description" box rows="4" @blur="patch({description: application.description})"/>
    <v-text-field label="Adresse" v-model="application.url" @blur="patch({url: application.url})"/>
  </v-container>
</template>

<script>
import {mapState, mapActions} from 'vuex'
export default {
  computed: {
    ...mapState('application', ['application'])
  },
  methods: {
    ...mapActions('application', ['patch'])
  }
}
</script>

<style lang="css">
</style>
