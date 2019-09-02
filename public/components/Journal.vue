<template lang="html">
  <v-data-table
    :items="journal.filter(event => !!eventTypes[event.type])"
    hide-actions
    hide-headers
    class="elevation-1 journal"
  >
    <template slot="items" slot-scope="props">
      <tr :class="'event-' + props.item.type">
        <td><v-icon>{{ eventTypes[props.item.type].icon }}</v-icon></td>
        <td>
          {{ eventTypes[props.item.type].text }}
          <template v-if="props.item.data">
            <br>
            <p v-html="props.item.data" />
          </template>
        </td>
        <td class="text-xs-right">
          {{ props.item.date | moment("DD/MM/YYYY, HH:mm") }}
        </td>
      </tr>
    </template>
  </v-data-table>
</template>

<script>
const events = require('../../shared/events.json')

export default {
  props: ['journal', 'type'],
  data() {
    return { eventTypes: events[this.type] }
  }
}
</script>

<style lang="css">
</style>
