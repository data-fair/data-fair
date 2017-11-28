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

export default {
  name: 'journal',
  props: ['dataset'],
  data: () => ({
    journal: [],
    types: {
      created: {
        icon: 'add_circle_outline',
        text: 'Le jeu de donné a été créé'
      },
      'data-updated': {
        icon: 'update',
        text: 'Les données ont été mises à jour'
      },
      'analyze-start': {
        icon: 'search',
        text: 'Début de l\'analyze du fichier'
      },
      'analyze-end': {
        icon: 'search',
        text: 'Fin de l\'analyze du fichier'
      }
    }
  }),
  mounted() {
    this.refresh()
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
