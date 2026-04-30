<template>
  <v-menu>
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        :icon="mdiDownload"
        :title="t('downloadSchema')"
        color="primary"
        variant="flat"
        size="small"
      />
    </template>
    <v-list>
      <v-list-item
        :href="downloadUrls.tableSchema"
        :prepend-icon="mdiTable"
        :title="t('downloadAsTableSchema')"
        download
      />
      <v-list-item
        :href="downloadUrls.jsonSchema"
        :prepend-icon="mdiCodeJson"
        :title="t('downloadAsJsonSchema')"
        download
      />
    </v-list>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  downloadSchema: Télécharger le schéma
  downloadAsJsonSchema: Télécharger au format JSON Schema
  downloadAsTableSchema: Télécharger au format Table Schema
en:
  downloadSchema: Download the schema
  downloadAsJsonSchema: Download as JSON Schema
  downloadAsTableSchema: Download as Table Schema
</i18n>

<script setup lang="ts">
import { mdiCodeJson, mdiDownload, mdiTable } from '@mdi/js'

const { t } = useI18n()
const { id } = useDatasetStore()

const downloadUrls = {
  tableSchema: $apiPath + '/datasets/' + id + '/schema?mimeType=' + encodeURIComponent('application/tableschema+json'),
  jsonSchema: $apiPath + '/datasets/' + id + '/schema?mimeType=' + encodeURIComponent('application/schema+json')
}

</script>
