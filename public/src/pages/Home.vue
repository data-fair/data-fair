<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90">
    <md-layout md-row>
      <md-layout md-column md-flex="60">
        <datasets></datasets>
        <external-apis></external-apis>
      </md-layout>
      <md-layout md-column md-flex="40">
        <import-file></import-file>
        <import-api></import-api>
        <!-- <import-file @datasets-change="listDatasets"></import-file> -->
      </md-layout>
    </md-layout>

  </md-layout>
</md-layout>
</template>

<script>
import ImportFile from '../components/ImportFile.vue'
import ImportApi from '../components/ImportApi.vue'
import Datasets from '../components/Datasets.vue'
import ExternalApis from '../components/ExternalApis.vue'

export default {
  name: 'home',
  components: {
    ImportFile,
    ImportApi,
    Datasets,
    ExternalApis
  }
}
</script>
