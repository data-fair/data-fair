<template lang="html">
  <v-layout row>
    <v-navigation-drawer clipped>
      <v-subheader>{{ $t("pages.userguide.title") }}</v-subheader>
      <v-list>
        <v-list-tile v-for="page in pages" :key="page" :to="localePath({name: 'user-guide-id', params: {id: page}})">
          <v-list-tile-title>{{ $t(`pages.userguide.${page.replace('-', '')}.title`) }}</v-list-tile-title>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>
    <v-container v-show="ready" class="doc-page" v-html="content" style="overflow-y:scroll;height:calc(100vh - 148px)"/>
  </v-layout>
</template>

<script>
// Webpack way of requiring a bunch of modules at once
const context = require.context('.', true, /\.md$/)

export default {
  data: () => ({
    ready: false,
    pages: ['use']
  }),
  computed: {
    content() {
      if (!this.$route) return
      const content = context(`./${this.$route.params.id}-${this.$i18n.locale}.md`) || context(`./${this.$route.params.id}-fr.md`)
      return content
    }
  },
  mounted() {
    // Apply classes from vuetify to markdown generated HTML
    const elemClasses = {
      h2: ['display-1'],
      h3: ['title', 'mb-4', 'mt-5'],
      h4: ['subheading', 'mb-3', 'mt-4'],
      p: ['body1'],
      table: ['datatable', 'table', 'card']
    }
    Object.keys(elemClasses).forEach(k => {
      this.$el.querySelectorAll(k).forEach(e => {
        elemClasses[k].forEach(c => e.classList.add(c))
      })
    })
    this.ready = true
  }
}
</script>

<style lang="less">
.doc-page {
    pre {
      white-space: pre-wrap;
    }
}
</style>
