<template>
  <md-layout md-row md-align="center">
    <md-layout md-column md-flex="60">
      <md-list>
        <md-list-item v-for="event in journal" v-if="types[event.type]" :key="event.date">
          <md-icon>{{ types[event.type].icon }}</md-icon> <span>{{ types[event.type].text }}</span> <span>{{ event.date | moment("DD/MM/YYYY, HH:mm") }}</span>
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
    ...mapState(['ws']),
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
