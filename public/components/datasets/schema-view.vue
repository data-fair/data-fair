<template>
  <v-data-table
    :headers="headers"
    :items="dataset.schema.filter(f => !f['x-calculated'])"
    :total-items="dataset.schema.filter(f => !f['x-calculated']).length"
    :disable-initial-sort="true"
    :hide-default-footer="true"
  >
    <template v-slot:item="{item}">
      <td>{{ item.key }}</td>
      <td>{{ item.title || item['x-originalName'] || item.key }}</td>
      <td>{{ item.format || item.type }}</td>
      <td>{{ vocabulary && vocabulary[item['x-refersTo']] && vocabulary[item['x-refersTo']].title }}</td>
      <td>{{ item.description || (vocabulary && vocabulary[item['x-refersTo']] && vocabulary[item['x-refersTo']].description) }}</td>
    </template>
  </v-data-table>
</template>

<script>
  import { mapState } from 'vuex'

  export default {
    data: () => ({
      headers: [{ value: 'key', text: 'Clé' }, { value: 'name', text: 'Nom' }, { value: 'type', text: 'Type' }, { value: 'x-refersTo', text: 'Concept' }, { value: 'description', text: 'Description' }],
    }),
    computed: {
      ...mapState(['vocabulary']),
      ...mapState('dataset', ['dataset']),
      labelProp() {
        return this.dataset && this.dataset.schema && this.dataset.schema.find(f => f['x-refersTo'] && ['http://www.w3.org/2000/01/rdf-schema#label', 'http://www.bbc.co.uk/ontologies/coreconcepts/label'].indexOf(f['x-refersTo']) >= 0)
      },
    },
  }
</script>
