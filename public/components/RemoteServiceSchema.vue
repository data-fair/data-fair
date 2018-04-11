<template lang="html">
  <v-data-table
    hide-headers
    :items="remoteService.actions"
    hide-actions
    class="elevation-1"
  >
    <template slot="items" slot-scope="props">
      <tr v-if="vocabulary">
        <td>
          <v-icon v-if="!props.item.inputCollection || !props.item.outputCollection" title="Opération unitaire">description</v-icon>
          <v-icon v-if="props.item.inputCollection && props.item.outputCollection" title="Opération de masse">view_list</v-icon>
        </td>
        <td>{{ props.item.summary }}</td>
        <td>
          <span v-if="!Object.keys(props.item.input).length">Pas de données en entrée</span>
          <v-chip v-for="input in props.item.input" :key="input.concept" style="margin:4px 4px;" v-if="vocabulary[input.concept]" :title="vocabulary[input.concept].description">
            {{ vocabulary[input.concept].title }}
          </v-chip>
        </td>
        <td><v-icon large color="primary">arrow_forward</v-icon></td>
        <td>
          <v-chip v-for="output in props.item.output" :key="output.concept" style="margin:4px 4px;" v-if="vocabulary[output.concept]" :title="vocabulary[output.concept].description">
            {{ vocabulary[output.concept].title }}
          </v-chip>
        </td>
      </tr>
    </template>
  </v-data-table>
</template>

<script>
const {mapState} = require('vuex')

export default {
  data: () => ({
    actions: {
      'http://schema.org/SearchAction': 'Recherche',
      'http://schema.org/ReadAction': 'Lecture',
      'http://schema.org/CheckAction': 'Vérification'
    }
  }),
  computed: {
    ...mapState('remoteService', ['remoteService']),
    ...mapState(['vocabulary'])
  }
}
</script>

<style lang="css">
</style>
