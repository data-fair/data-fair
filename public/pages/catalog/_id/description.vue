<template lang="html">
  <v-container>
    <v-text-field label="Titre" v-model="catalog.title" @blur="patch({title: catalog.title})"/>
    <v-textarea label="Description" v-model="catalog.description" box rows="4" @blur="patch({description: catalog.description})"/>
    <v-text-field label="Adresse" :disabled="true" v-model="catalog.url"/>
    <catalog-config-form :catalog="catalog" @change="changes => patch(changes)"/>
  </v-container>
</template>

<script>
import {mapState, mapActions} from 'vuex'
import CatalogConfigForm from '../../../components/CatalogConfigForm.vue'

export default {
  components: {CatalogConfigForm},
  computed: {
    ...mapState('catalog', ['catalog'])
  },
  methods: {
    ...mapActions('catalog', ['patch'])
  }
}
</script>

<style lang="css">
</style>
