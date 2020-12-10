<template lang="html">
  <v-container
    fluid
    class="doc-page px-6"
  >
    <v-row>
      <v-col>
        <h2 class="display1 my-4">
          {{ (filledContent.meta && filledContent.meta.title) || this.$route.params.id }}
        </h2>
        <div
          v-show="ready"
          cols="12"
          v-html="filledContent.html"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import { mapState } from 'vuex'
  const marked = require('@hackmd/meta-marked')
  // const escape = require('escape-string-regexp')
  require('highlight.js/styles/github.css')

  export default {
    props: ['content'],
    data: () => ({ ready: false }),
    computed: {
      ...mapState(['env']),
      filledContent() {
        return marked(this.content)// .replace(new RegExp(escape('<span>{{</span>publicUrl<span>}}</span>', 'g')), this.env.publicUrl)
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
        // code: ['theme--light'],
        pre: ['pt-3', 'mb-4', 'px-2'],
      }
      Object.keys(elemClasses).forEach(k => {
        this.$el.querySelectorAll(k).forEach(e => {
          elemClasses[k].forEach(c => e.classList.add(c))
        })
      })
      this.$el.querySelectorAll('img').forEach(img => {
        img.parentElement.classList.add('text-center')
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

    }
    p img {
      max-width:100%;
      margin: 12px auto;
      border: solid;
      border-width: 1px;
    }
}
</style>
