<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90">
    <md-layout md-row>
      <md-layout md-column md-flex="60">
        <datasets></datasets>
        <external-apis></external-apis>
        <application-configs></application-configs>
      </md-layout>
      <md-layout md-column md-flex="40">
        <import-application></import-application>
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
import ImportApplication from '../components/ImportApplication.vue'
import Datasets from '../components/Datasets.vue'
import ExternalApis from '../components/ExternalApis.vue'
import ApplicationConfigs from '../components/ApplicationConfigs.vue'

export default {
  name: 'home',
  components: {
    ImportFile,
    ImportApi,
    ImportApplication,
    Datasets,
    ExternalApis,
    ApplicationConfigs
  }
}
</script>
