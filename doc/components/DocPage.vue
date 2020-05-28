<template lang="html">
  <v-container
    fluid
    class="doc-page"
  >
    <v-navigation-drawer
      app
      fixed
      style="padding-top: 64px;"
    >
      <v-subheader>{{ $t(`pages.${prefix}.title`) }}</v-subheader>
      <v-list>
        <v-list-item
          v-for="pageId in pages"
          :key="pageId"
          :to="localePath({name: prefix + '-id', params: {id: pageId}})"
        >
          <v-list-item-title>{{ $t(`pages.${prefix}.${pageId}.title`) }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
    <v-row>
      <v-col>
        <h2 class="display1 my-4">
          {{ $t(`pages.${prefix}.${page}.title`) }}
        </h2>
        <div
          v-show="ready"
          cols="12"
          v-html="filledContent"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import { mapState } from 'vuex'
  const escape = require('escape-string-regexp')
  require('highlight.js/styles/github.css')

  export default {
    props: ['prefix', 'pages', 'page', 'content'],
    data: () => ({ ready: false }),
    computed: {
      ...mapState(['env']),
      filledContent() {
        return this.content.replace(new RegExp(escape('<span>{{</span>publicUrl<span>}}</span>', 'g')), this.env.publicUrl)
      },
    },
    mounted() {
      // Apply classes from vuetify to markdown generated HTML
      const elemClasses = {
        h2: ['display-1', 'my-4'],
        h3: ['title', 'mb-4', 'mt-5'],
        h4: ['subheading', 'mb-3', 'mt-4'],
        p: ['body1'],
        table: ['v-datatable', 'v-table', 'theme--light', 'elevation-1'],
        code: ['theme--light'],
        'pre code': ['v-card', 'pt-3', 'mb-4'],
      }
      Object.keys(elemClasses).forEach(k => {
        this.$el.querySelectorAll(k).forEach(e => {
          elemClasses[k].forEach(c => e.classList.add(c))
        })
      })
      this.ready = true
    },
  }
</script>

<style lang="less">
.doc-page {
    pre {
      white-space: pre-wrap;
    }
    code {
      padding-left: 6px;
    }
    code:before {
      content: ''
    }
}
</style>
