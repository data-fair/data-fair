<template>
<md-layout md-row md-align="center">
  <md-layout md-column md-flex="60">
      <md-list>
        <md-list-item v-for="event in journal">
          <md-icon>{{types[event.type].icon}}</md-icon> <span>{{types[event.type].text}}</span> <span>{{event.date | moment("DD/MM/YYYY, HH:mm")}}</span>
        </md-list-item>
      </md-list>
  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')
const events = require('../events.json')

export default {
  name: 'journal',
  props: ['dataset'],
  data: () => ({
    journal: [],
    types: events
  }),
  mounted() {
    this.refresh()
    this.refreshInterval = setInterval(this.refresh, 1000)
  },
  destroyed() {
    clearInterval(this.refreshInterval)
  },
  methods: {
    refresh() {
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/journals/' + this.dataset.id).then(results => {
        this.journal = results.data
      })
    }
  }
}
</script>
