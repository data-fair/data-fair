<template lang="html">
  <v-sheet>
    <v-data-table
      :items="journal.filter(event => !!eventTypes[event.type])"
      hide-default-footer
      hide-default-header
      class="journal"
    >
      <template #item="{item}">
        <tr :class="`event-${item.type} ${eventTypes[item.type].color ? eventTypes[item.type].color + '--text' : ''}`">
          <td>
            <v-icon :color="eventTypes[item.type].color || 'default'">
              {{ eventTypes[item.type].icon }}
            </v-icon>
          </td>
          <td>
            <span>{{ eventTypes[item.type].text[$i18n.locale] || eventTypes[item.type].text[$i18n.defaultLocale] }}</span>
            <span
              v-if="item.draft"
              class="font-weight-thin font-italic ml-4"
            >brouillon</span>
            <template v-if="item.data">
              <br>
              <p
                class="mb-0"
                v-html="item.data"
              />
            </template>
          </td>
          <td class="text-right">
            {{ item.date | moment("lll") }}
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
  data () {
    return { eventTypes: events[this.type] }
  }
}
</script>

<style lang="css">
</style>
