<template>
  <v-list
    v-scroll="onScroll"
    dense
    class="pl-4 py-0"
  >
    <v-list-item
      v-for="section in sections"
      :key="section.id"
      :style="activeSection && activeSection.id === section.id ? activeStyle : ''"
      @click="goTo(section.id)"
    >
      <v-list-item-content>
        <v-list-item-title :class="{'primary--text': activeSection && activeSection.id === section.id}">
          {{ section.title }}
        </v-list-item-title>
      </v-list-item-content>
    </v-list-item>
  </v-list>
</template>

<script>
  export default {
    props: {
      sections: { type: Array, default: () => ([]) },
    },
    data: () => ({
      offsets: [],
      timeout: null,
      activeSection: null,
    }),
    computed: {
      toc() {
        return this.sections.map(s => ({ ...s, hash: `#${s.id}` })).reverse()
      },
      activeStyle() {
        return `border-left: 3px solid ${this.$vuetify.theme.themes.light.primary};`
      },
    },
    mounted() {
      this.onScroll()
    },
    methods: {
      goTo(id) {
        const e = document.getElementById(id)
        if (!e) return null
        this.$vuetify.goTo(e.offsetTop + 20)
      },
      // inspired by https://github.com/vuetifyjs/vuetify/blob/34a37a06fd49e4c70f47b17e46eaa56716250283/packages/docs/src/layouts/default/Toc.vue#L126
      setOffsets () {
        this.offsets = this.toc.map(t => {
          const e = document.getElementById(t.id)
          if (!e) return null
          return e.offsetTop
        }).filter(o => o !== null)
      },
      async findActiveIndex() {
        const currentOffset = (
          window.pageYOffset ||
          document.documentElement.offsetTop ||
          0
        )

        if (this.offsets.length !== this.toc.length) this.setOffsets()
        let index = this.offsets.findIndex(offset => offset - 40 < currentOffset)
        if (index === -1) index = this.toc.length - 1
        if (currentOffset + window.innerHeight === document.documentElement.offsetHeight) {
          index = 0
        }
        this.activeSection = this.toc[index]
      },
      onScroll () {
        clearTimeout(this.timeout)
        this.timeout = setTimeout(this.findActiveIndex, 17)
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
