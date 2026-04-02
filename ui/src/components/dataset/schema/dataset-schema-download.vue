<template>
  <v-menu>
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        :prepend-icon="mdiDownload"
        color="primary"
        variant="flat"
      >
        {{ t('downloadSchema') }}
      </v-btn>
    </template>
    <v-list>
      <v-list-item
        :href="downloadUrls.tableSchema"
        :prepend-icon="mdiTable"
        :title="t('tableSchema')"
        download
      />
      <v-list-item
        :href="downloadUrls.jsonSchema"
        :prepend-icon="mdiCodeJson"
        :title="t('jsonSchema')"
        download
      />
    </v-list>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  downloadSchema: Télécharger le schéma
  jsonSchema: Schéma JSON
  tableSchema: Schéma Table
en:
  downloadSchema: Download the schema
  jsonSchema: JSON Schema
  tableSchema: Table Schema
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
