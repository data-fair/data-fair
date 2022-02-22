<template>
  <div v-if="datasets.count" :style="`position:relative;width:100%;height:${height}px;`">
    <div
      v-for="box in boxes || []"
      :key="box.data.id"
      :style="`padding:1.5px; position:absolute; top:${box.y0}px; left:${box.x0 * ratio}px; bottom:${height - box.y1}px; right:${width - (box.x1 * ratio)}px;`"
    >
      <v-card
        style="width:100%;height:100%;"
        :to="box.data.to"
        :color="box.data.color"
        dark
        flat
        :title="box.data.tooltip"
      >
        <v-card-title class="text-subtitle-1 py-0 px-2">
          <span style="white-space: nowrap;overflow: hidden;text-overflow: ellipsis;">
            {{ box.data.tooltip || box.data.title }}
          </span>
        </v-card-title>
      </v-card>
    </div>
  </div>
</template>

<script>
  import Vue from 'vue'
  import { mapGetters } from 'vuex'
  const d3 = require('d3-hierarchy')

  export default {
    props: {
      datasets: { type: Object, required: true },
      stats: { type: Object, required: true },
    },
    data: () => ({
      width: null,
      height: 300,
      boxes: null,
      ratio: 1.62,
    }),
    computed: {
      ...mapGetters(['lightPrimary10', 'lightAccent10', 'darkPrimary10', 'darkAccent10']),
    },
    mounted() {
      window.addEventListener('resize', () => this.refresh(), true)
      this.refresh()
    },
    methods: {
      visibilityColor(visibility) {
        if (this.$vuetify.theme.dark) {
          return visibility === 'public' ? this.darkPrimary10 : this.darkAccent10
        } else {
          return visibility === 'public' ? this.lightPrimary10 : this.lightAccent10
        }
      },
      refresh() {
        this.width = this.$el.offsetWidth
        const data = {
          children: this.datasets.results
            .filter(d => !!d.storage)
            .map(d => ({
              id: d.id,
              title: d.title || d.id,
              size: d.storage.staticSize,
              tooltip: `${d.title || d.id} - ${Vue.filter('displayBytes')(d.storage.staticSize, this.$i18n.locale)} - ${{ public: 'Public', private: 'Privé', protected: 'Protégé' }[d.visibility]}`,
              to: `/dataset/${d.id}`,
              color: this.visibilityColor(d.visibility),
            })),
        }
        if (this.datasets.count > this.datasets.results.length) {
          const nbOthers = this.datasets.count - this.datasets.results.length
          const size = this.stats.storage - this.datasets.results.reduce((a, d) => a + d.storage.staticSize, 0)
          const title = nbOthers === 1 ? '1 autre jeu de donnée' : nbOthers.toLocaleString() + ' autres jeux de données'
          data.children.push({
            id: '_others',
            title,
            size,
            tooltip: `${title} - ${Vue.filter('displayBytes')(size, this.$i18n.locale)}`,
            color: 'grey',
          })
        }
        const hierarchy = d3.hierarchy(data)
          // .sum(d => d.size)
          .sum(d => Math.sqrt(d.size))
        d3.treemap()
          .size([this.width / this.ratio, this.height])
          .tile(d3.treemapSquarify.ratio(1))(hierarchy)

        this.boxes = hierarchy.leaves()
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
