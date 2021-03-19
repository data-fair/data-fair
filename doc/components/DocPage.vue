<template lang="html">
  <v-container class="doc-page">
    <v-row>
      <v-col>
        <h2 class="display1 my-4">
          {{ (filledContent.meta && filledContent.meta.title) || this.$route.params.id }}
        </h2>
        <v-alert
          v-if="filledContent.meta && filledContent.meta.published === false"
          type="warning"
          border="left"
          outlined
        >
          Cette page est en chantier et les informations qu'elle contient peuvent ne pas être à jour.
        </v-alert>
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
        const content = marked(this.content)
        content.html = content.html.replace('<table>', '<div class="v-data-table v-data-table--dense theme--light"><div class="v-data-table__wrapper"><table>').replace('</table>', '</table></div></div>')
        return content
      },
    },
    mounted() {
      // Apply classes from vuetify to markdown generated HTML
      const elemClasses = {
        h2: ['display-1', 'my-4'],
        h3: ['title', 'mb-4', 'mt-5'],
        h4: ['subheading', 'mb-3', 'mt-4'],
        p: ['body1'],
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
    p img, .v-data-table {
      max-width:100%;
      margin: 12px auto;
      border: solid;
      border-width: 1px;
    }
}
</style>
