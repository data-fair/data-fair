<template>
  <v-data-table
    class="dataset-schema-view"
    :headers="headers"
    :items="dataset.schema.filter(f => !f['x-calculated'])"
    :server-items-length="dataset.schema.filter(f => !f['x-calculated']).length"
    :hide-default-footer="true"
    disable-sort
  >
    <template #item="{item}">
      <tr>
        <td>{{ item.key }}</td>
        <td>{{ item.title || item['x-originalName'] || item.key }}</td>
        <td>{{ propTypeTitle(item) }}</td>
        <td>{{ vocabulary && vocabulary[item['x-refersTo']] && vocabulary[item['x-refersTo']].title }}</td>
        <td v-html="item.description || (vocabulary && vocabulary[item['x-refersTo']] && vocabulary[item['x-refersTo']].description)" />
      </tr>
    </template>
    <template #top>
      <div class="text-center">
        <v-menu
          offset-y
          tile
        >
          <template #activator="{ on }">
            <v-btn
              color="primary"
              text
              v-on="on"
            >
              {{ $t('downloadSchema') }}&nbsp;
              <v-icon>mdi-download</v-icon>
            </v-btn>
          </template>
          <v-list
            class="pt-0"
            dense
          >
            <v-list-item
              :href="downloadUrls.tableschema"
              target="download"
            >
              <v-list-item-avatar :size="30">
                <v-avatar :size="30">
                  <v-icon>
                    mdi-table
                  </v-icon>
                </v-avatar>
              </v-list-item-avatar>
              <v-list-item-title>Table schema</v-list-item-title>
            </v-list-item>
            <v-list-item
              :href="downloadUrls.jsonschema"
              target="download"
            >
              <v-list-item-avatar :size="30">
                <v-avatar :size="30">
                  <v-icon>
                    mdi-code-json
                  </v-icon>
                </v-avatar>
              </v-list-item-avatar>
              <v-list-item-title>Json schema</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </template>
  </v-data-table>
</template>

<i18n lang="yaml">
fr:
  downloadSchema: Télécharger le schéma
en:
  downloadSchema: Download the schema
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import buildURL from 'axios/lib/helpers/buildURL'

export default {
  data: () => ({
    headers: [
      { value: 'key', text: 'Clé' },
      { value: 'name', text: 'Nom' },
      { value: 'type', text: 'Type' },
      { value: 'x-refersTo', text: 'Concept' },
      { value: 'description', text: 'Description' }
    ]
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    ...mapGetters(['propTypeTitle', 'propTypeIcon']),
    labelProp () {
      return this.dataset && this.dataset.schema && this.dataset.schema.find(f => f['x-refersTo'] && ['http://www.w3.org/2000/01/rdf-schema#label', 'http://www.bbc.co.uk/ontologies/coreconcepts/label'].indexOf(f['x-refersTo']) >= 0)
    },
    downloadUrls () {
      return {
        tableschema: buildURL(this.resourceUrl + '/schema', { mimeType: 'application/tableschema+json' }),
        jsonschema: buildURL(this.resourceUrl + '/schema', { mimeType: 'application/schema+json' })
      }
    }
  }
}
</script>

<style>
.dataset-schema-view td p:last-child {
  margin-bottom: 0;
}
</style>
