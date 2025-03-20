<template>
  <v-data-table-virtual
    v-if="dataset"
    :group-by="[{ key: 'x-group' }]"
    :headers="headers"
    :items="dataset.schema.filter(f => !f['x-calculated'])"
    hide-default-footer
    fixed-header
  >
    <template #item.title="{ item }">
      {{ item.title || item['x-originalName'] || item.key }}
    </template>
    <template #item.type="{ item }">
      {{ propTypeTitle(item) }}
    </template>
    <template #item.x-refersTo="{ item }">
      {{ vocabulary && vocabulary[item['x-refersTo']] && vocabulary[item['x-refersTo']].title }}
    </template>
    <template #item.description="{ item }">
      <p v-safe-html="item.description || (vocabulary && vocabulary[item['x-refersTo']] && vocabulary[item['x-refersTo']].description)" />
    </template>
    <template #top>
      <div class="text-center">
        <v-menu>
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              color="primary"
              variant="text"
            >
              {{ t('downloadSchema') }}&nbsp;
              <v-icon
                :icon="mdiDownload"
              />
            </v-btn>
          </template>
          <v-list>
            <v-list-item
              :href="downloadUrls.tableschema"
              :prepend-icon="mdiTable"
              :title="t('tableSchema')"
              download
            />
            <v-list-item
              :href="downloadUrls.jsonschema"
              :prepend-icon="mdiCodeJson"
              :title="t('jsonSchema')"
              download
            />
          </v-list>
        </v-menu>
      </div>
    </template>
  </v-data-table-virtual>
</template>

<i18n lang="yaml">
fr:
  downloadSchema: Télécharger le schéma
  jsonSchema: Schéma JSON
  tableSchema: Schéma Table
  key: Clé
  name: Nom
  type: Type
  x-refersTo: Concept
  description: Description
en:
  downloadSchema: Download the schema
  jsonSchema: JSON Schema
  tableSchema: Table Schema
  key: Key
  name: Name
  type: Type
  x-refersTo: Concept
  description: Description
</i18n>

<script lang="ts" setup>
import { mdiCodeJson, mdiDownload, mdiTable } from '@mdi/js'
import { propTypeTitle } from '~/utils/dataset'

const { t } = useI18n()
const { vocabulary } = useStore()
const { id, dataset } = useDatasetStore()

const downloadUrls = {
  tableschema: $apiPath + '/datasets/' + id + '/schema?mimeType=' + encodeURIComponent('application/tableschema+json'),
  jsonschema: $apiPath + '/datasets/' + id + '/schema?mimeType=' + encodeURIComponent('application/schema+json')
}

const headers = [
  { key: 'key', title: t('key') },
  { key: 'name', title: t('name') },
  { key: 'type', title: t('type') },
  { key: 'x-refersTo', title: t('x-refersTo') },
  { key: 'description', title: t('description') }
]

</script>
