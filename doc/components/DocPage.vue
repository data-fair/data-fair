<template lang="html">
  <v-container fluid class="doc-page">
    <v-navigation-drawer app fixed style="padding-top: 64px;">
      <v-subheader>{{ $t(`pages.${prefix}.title`) }}</v-subheader>
      <v-list>
        <v-list-tile v-for="page in pages" :key="page" :to="localePath({name: prefix + '-id', params: {id: page}})">
          <v-list-tile-title>{{ $t(`pages.${prefix}.${page}.title`) }}</v-list-tile-title>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>
    <v-layout column>
      <h2 class="display1 my-4">{{ $t(`pages.${prefix}.${page}.title`) }}</h2>
      <v-flex v-show="ready" xs12 v-html="content"/>
    </v-layout>
  </v-container>
</template>

<script>
export default {
  props: ['prefix', 'pages', 'page', 'content'],
  data: () => ({ ready: false }),
  mounted() {
    // Apply classes from vuetify to markdown generated HTML
    const elemClasses = {
      h2: ['display-1', 'my-4'],
      h3: ['title', 'mb-4', 'mt-5'],
      h4: ['subheading', 'mb-3', 'mt-4'],
      p: ['body1'],
      table: ['v-datatable', 'v-table', 'theme--light', 'elevation-1'],
      code: ['theme--light'],
      'pre code': ['v-card', 'py-4']
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
