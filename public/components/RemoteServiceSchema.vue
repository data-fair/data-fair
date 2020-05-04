<template lang="html">
  <v-data-table
    :items="remoteService.actions"
    hide-default-header
    hide-default-footer
    class="elevation-1"
  >
    <template v-slot:item="{item}">
      <tr v-if="vocabulary">
        <td>
          <v-icon
            v-if="!item.inputCollection || !item.outputCollection"
            title="Opération unitaire"
          >
            description
          </v-icon>
          <v-icon
            v-if="item.inputCollection && item.outputCollection"
            title="Opération de masse"
          >
            mdi-view-list
          </v-icon>
        </td>
        <td>{{ item.summary }}</td>
        <td>
          <span v-if="!Object.keys(item.input).length">Pas de données en entrée</span>
          <template v-for="input in item.input">
            <v-chip
              v-if="vocabulary[input.concept]"
              :key="input.concept"
              :title="vocabulary[input.concept].description"
              style="margin:4px 4px;"
            >
              {{ vocabulary[input.concept].title }}
            </v-chip>
          </template>
        </td>
        <td>
          <v-icon
            large
            color="primary"
          >
            arrow_forward
          </v-icon>
        </td>
        <td>
          <template v-for="output in item.output">
            <v-chip
              v-if="vocabulary[output.concept]"
              :key="output.concept"
              :title="vocabulary[output.concept].description"
              style="margin:4px 4px;"
            >
              {{ vocabulary[output.concept].title }}
            </v-chip>
          </template>
        </td>
      </tr>
    </template>
  </v-data-table>
</template>

<script>
  const { mapState } = require('vuex')

  export default {
    data: () => ({
      actions: {
        'http://schema.org/SearchAction': 'Recherche',
        'http://schema.org/ReadAction': 'Lecture',
        'http://schema.org/CheckAction': 'Vérification',
      },
    }),
    computed: {
      ...mapState('remoteService', ['remoteService']),
      ...mapState(['vocabulary']),
    },
  }
</script>

<style lang="css">
</style>
