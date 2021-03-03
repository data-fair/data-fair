<template>
  <div style="max-width: 500px;height: 250px;">
    <canvas id="storage-pie" />
  </div>
</template>

<script>
  import Vue from 'vue'
  import Chart from 'chart.js'
  import tinycolor from 'tinycolor2'
  const { mapGetters } = require('vuex')

  export default {
    props: {
      datasets: { type: Object, required: true },
      stats: { type: Object, required: true },
      width: { type: Number, default: 300 },
    },
    computed: {
      ...mapGetters('session', ['activeAccount']),
    },
    async mounted() {
      await this.refresh()
    },
    methods: {
      async refresh() {
        const c = (light) => tinycolor(this.$vuetify.theme.themes.light.primary).lighten(light * 5).toHexString()
        const data = {
          datasets: [{
            borderWidth: 1,
            data: this.datasets.results.map(d => d.storage.size),
            backgroundColor: this.datasets.results.map((_, i) => c(i)),
          }],
          labels: this.datasets.results.map(d => Vue.filter('truncate')(d.title, 30)),
        }
        if (this.datasets.count > this.datasets.results.length) {
          data.datasets[0].data.push(this.stats.storage - this.datasets.results.reduce((a, d) => a + d.storage.size, 0))
          data.datasets[0].backgroundColor.push(tinycolor(this.$vuetify.theme.themes.light.accent).lighten(20).toHexString())
          const nbOthers = this.datasets.count - this.datasets.results.length
          if (nbOthers === 1) data.labels.push('1 autre jeu de donnée')
          else data.labels.push(nbOthers.toLocaleString() + ' autres jeux de données')
        }
        /* if (this.stats.storageLimit) {
          data.datasets[0].data.push(Math.max(0, this.stats.storageLimit - this.stats.storage))
          data.labels.push('Espace restant')
        } */
        const options = {
          // responsive: false,
          legend: {
            // display: false,
            position: 'right',
          },
          tooltips: {
            callbacks: {
              label: function(tooltipItem, data) {
                return data.labels[tooltipItem.index] + ': ' + Vue.filter('displayBytes')(data.datasets[0].data[tooltipItem.index])
              },
            },
          },
        }

        new Chart('storage-pie', { type: 'pie', data, options })
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
