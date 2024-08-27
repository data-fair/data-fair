<template lang="html">
  <v-sheet>
    <v-list
      class="journal"
    >
      <template v-for="(item,i) in events">
        <template v-if="item.draft && !events[i-1]?.draft">
          <span
            :key="`draft-${i}`"
            class="text-caption ml-2"
          >brouillon</span>
          <v-divider
            :key="`before-${i}`"
          />
        </template>
        <v-list-item
          :key="i"
          :dense="item.draft"
        >
          <v-list-item-icon
            :class="`mr-3`"
            :style="`${item.draft ? 'margin-top:6px;margin-bottom:6px;' : ''}`"
          >
            <v-icon
              :color="getEventType(item).color || 'default'"
              :small="item.draft"
            >
              {{ getEventType(item).icon }}
            </v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title :class="`event-${item.type}`">
              <span
                v-if="item.type === 'error'"
                class="error--text"
              >
                {{ item.data || eventLabel(item) }}
              </span>
              <span
                v-else
                :class="`event-${item.type} ${getEventType(item).color ? getEventType(item).color + '--text' : ''}`"
              >
                {{ eventLabel(item) }}
                {{ item.type === 'draft-validated' ? `(${item.data})` : '' }}
              </span>
              <span
                style="float: right"
                class="text-caption"
              >
                {{ item.date | moment("lll") }}
              </span>
            </v-list-item-title>
            <v-list-item-subtitle v-if="item.data && item.type !== 'draft-validated' && item.type !== 'error'">
              <p
                class="mb-0"
                v-html="item.data"
              />
            </v-list-item-subtitle>
          </v-list-item-content>

          <v-divider
            v-if="item.draft"
            vertical
            style="position:absolute;left:1px;"
          />
          <v-divider
            v-if="item.draft"
            vertical
            style="position:absolute;right:1px;"
          />
        </v-list-item>
        <v-divider
          v-if="item.draft && !events[i+1]?.draft"
          :key="`before-${i}`"
        />
      </template>
    </v-list>
  </v-sheet>
</template>

<script>
const events = require('../../shared/events.json')

export default {
  props: ['journal', 'type'],
  data () {
    return { eventTypes: events[this.type], draftEventTypes: events[this.type + '-draft'] }
  },
  computed: {
    events () {
      return this.journal.filter(event => !!this.eventTypes[event.type])
    },
    eventLabel () {
      return (item) => {
        const eventType = this.getEventType(item)
        return eventType.text[this.$i18n.locale] || eventType.text[this.$i18n.defaultLocale]
      }
    }
  },
  methods: {
    getEventType (item) {
      return (item.draft && this.draftEventTypes && this.draftEventTypes[item.type]) ? this.draftEventTypes[item.type] : this.eventTypes[item.type]
    }
  }
}
</script>

<style lang="css">
</style>
