<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90">
    <md-layout md-row>
      <md-button class="md-raised md-primary" @click="$refs.sidenav.open()">Importer un fichier</md-button>
    </md-layout>
    <datasets-list></datasets-list>
  </md-layout>
  <md-sidenav class="md-right sidenav-half" ref="sidenav">
    <import-file></import-file>
  </md-sidenav>
</md-layout>
</template>

<script>
import ImportFile from '../components/ImportFile.vue'
import DatasetsList from '../components/DatasetsList.vue'

export default {
  name: 'datasets',
  components: {
    ImportFile,
    DatasetsList
  }
}
</script>

<style>
.sidenav-half .md-sidenav-content{
  width:50%;
}
</style>
