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
      datasets: { type: Array, required: true },
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
        const nbLargest = 8
        let largestDatasets = this.datasets
        let otherDatasets = []
        if (this.datasets.length > nbLargest + 1) {
          largestDatasets = this.datasets.slice(0, nbLargest)
          otherDatasets = this.datasets.slice(nbLargest)
        }
        const c = (light) => tinycolor(this.$vuetify.theme.themes.light.primary).lighten(light * 5).toHexString()
        const data = {
          datasets: [{
            borderWidth: 1,
            data: largestDatasets.map(d => d.storage.size),
            backgroundColor: largestDatasets.map((_, i) => c(i)),
          }],
          labels: largestDatasets.map(d => d.title),
        }
        if (otherDatasets.length) {
          data.datasets[0].data.push(otherDatasets.reduce((a, d) => a + d.storage.size, 0))
          data.datasets[0].backgroundColor.push(tinycolor(this.$vuetify.theme.themes.light.accent).lighten(20).toHexString())
          data.labels.push(otherDatasets.length.toLocaleString() + ' autres jeux de données')
        }
        if (this.stats.storageLimit) {
          data.datasets[0].data.push(Math.max(0, this.stats.storageLimit - this.stats.storage))
          data.labels.push('Espace restant')
        }
        const options = {
          // responsive: false,
          legend: {
            // display: false,
            position: 'right',
          },
          tooltips: {
            callbacks: {
              label: function(tooltipItem, data) {
                console.log(tooltipItem, data)
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
