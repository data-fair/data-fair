<template lang="html">
  <v-sheet :elevation="1" tile>
    <v-data-table
      :items="journal.filter(event => !!eventTypes[event.type])"
      hide-default-footer
      hide-default-header
      class="journal"
    >
      <template v-slot:item="{item}">
        <tr :class="'event-' + item.type">
          <td><v-icon>{{ eventTypes[item.type].icon }}</v-icon></td>
          <td>
            {{ eventTypes[item.type].text }}
            <template v-if="item.data">
              <br>
              <p v-html="item.data" />
            </template>
          </td>
          <td class="text-right">
            {{ item.date | moment("DD/MM/YYYY, HH:mm") }}
          </td>
        </tr>
      </template>
    </v-data-table>
  </v-sheet>
</template>

<script>
  const events = require('../../shared/events.json')

  export default {
    props: ['journal', 'type'],
    data() {
      return { eventTypes: events[this.type] }
    },
  }
</script>

<style lang="css">
</style>
