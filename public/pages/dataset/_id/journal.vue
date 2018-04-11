<template>
  <v-container class="journal">
    <v-data-table
      :items="journal.filter(event => !!types[event.type])"
      hide-actions
      hide-headers
      class="elevation-1"
    >
      <template slot="items" slot-scope="props">
        <tr :class="'event-' + props.item.type">
          <td><v-icon>{{ types[props.item.type].icon }}</v-icon></td>
          <td>
            {{ types[props.item.type].text }}
            <template v-if="props.item.data">
              <br>
              {{ props.item.data }}
            </template>
          </td>
          <td class="text-xs-right">{{ props.item.date | moment("DD/MM/YYYY, HH:mm") }}</td>
        </tr>
      </template>
    </v-data-table>
  </v-container>
</template>

<script>
const {mapState, mapActions} = require('vuex')
const events = require('../../../../shared/events.json')

export default {
  name: 'Journal',
  data() {
    return {types: events}
  },
  computed: {
    ...mapState('dataset', ['dataset', 'journal'])
  },
  mounted() {
    this.fetchJournal()
  },
  methods: {
    ...mapActions('dataset', ['fetchJournal'])
  }
}
</script>

<style lang="less">
  .event-finalize-end * {
    color: green !important;
  }

  .event-error * {
    color: red !important;
  }
</style>
