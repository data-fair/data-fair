<template>
  <md-layout md-row md-align="center" class="journal">
    <md-layout md-column md-flex="60">
      <md-list>
        <md-list-item v-for="event in journal" v-if="types[event.type]" :key="event.date" :class="'event-' + event.type">
          <md-icon>{{ types[event.type].icon }}</md-icon>
          <div>
            <p>{{ types[event.type].text }}</p>
            <p v-if="event.data">{{ event.data }}</p>
          </div>
          <span>{{ event.date | moment("DD/MM/YYYY, HH:mm") }}</span>
        </md-list-item>
      </md-list>
    </md-layout>
  </md-layout>
</template>

<script>
const {mapState, mapActions} = require('vuex')
const events = require('../../../shared/events.json')

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
    ...mapActions('dataset', ['fetchJournal', 'addJournalEvent'])
  }
}
</script>

<style lang="less">
  .md-list-item.event-finalize-end {
    span, p, .md-icon {
      color: green;
    }
  }

  .md-list-item.event-error {
    span, p, .md-icon {
      color: red;
    }
  }
</style>
