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
const {mapState} = require('vuex')
const events = require('../../../shared/events.json')
const ws = require('../ws.js')

export default {
  name: 'Journal',
  props: ['dataset'],
  data() {
    return {
      journal: [],
      types: events,
      channel: 'datasets/' + this.dataset.id + '/journal'
    }
  },
  computed: {
    ...mapState(['ws'])
  },
  mounted() {
    this.refresh()
    ws.$emit('subscribe', this.channel)
    ws.$on(this.channel, event => this.journal.unshift(event))
  },
  destroyed() {
    ws.$emit('unsubscribe', this.channel)
  },
  methods: {
    refresh() {
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.dataset.id + '/journal').then(results => {
        this.journal = results.data
      })
    }
  }
}
</script>
