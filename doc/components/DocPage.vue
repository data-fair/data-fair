<template lang="html">
  <v-container class="doc-page px-0">
    <!-- used to extract page tag by web scraper -->
    <div class="hidden-breadcrumb section-title">
      {{ breadcrumbs.slice(0, breadcrumbs.length - 1).join(' / ') }}
    </div>
    <v-row>
      <v-col>
        <h1
          v-if="!hideTitle"
          class="display1 my-4"
        >
          {{ (filledContent.meta && filledContent.meta.title) || $route.params.id }}
        </h1>
        <v-alert
          v-if="filledContent.meta && filledContent.meta.published === false"
          v-t="'constructionWarning'"
          type="warning"
          border="left"
          outlined
        />
        <v-alert
          v-if="onlyEnglish && $i18n.locale !== 'en'"
          v-t="'onlyEnglish'"
          type="warning"
          border="left"
          outlined
        />
        <v-alert
          v-if="onlyFrench && $i18n.locale !== 'fr'"
          v-t="'onlyFrench'"
          type="warning"
          border="left"
          outlined
        />
        <div
          v-show="ready"
          cols="12"
          v-html="filledContent.html"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n locale="fr" lang="yaml" src="../i18n/common-fr.yaml"></i18n>
<i18n locale="en" lang="yaml" src="../i18n/common-en.yaml"></i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import 'iframe-resizer/js/iframeResizer'

const marked = require('marked')
const metaMarked = require('@hackmd/meta-marked')

const renderer = new marked.Renderer()
renderer.defaultCode = renderer.code
renderer.code = function (code, language) {
  if (language === 'mermaid') {
    if (process.server) return ''
    const key = (Math.random() + '').replace('0.', '')
    window.sessionStorage.setItem('mermaid-' + key, code)
    return `<iframe class="mermaid-iframe" id="mermaid-iframe-${key}" frameborder="0" scrolling="no" style="width:100%" src="${process.env.base}mermaid?key=${key}"></iframe>`
  }
  return this.defaultCode(code, language)
}
marked.use({ renderer })

// const escape = require('escape-string-regexp')
require('highlight.js/styles/github.css')

export default {
  props: ['content', 'onlyEnglish', 'onlyFrench', 'hideTitle'],
  data: () => ({ ready: false }),
  computed: {
    ...mapState(['env']),
    ...mapGetters(['navContent']),
    filledContent () {
      const content = metaMarked(this.content)
      content.html = (marked.parse(content.markdown)).replace('<table>', '<div class="v-data-table v-data-table--dense theme--light"><div class="v-data-table__wrapper"><table>').replace('</table>', '</table></div></div>')
      return content
    },
    breadcrumbs () {
      const chapter = this.$route.path.split('/')[1]
      const localeNavContent = this.navContent(this.$i18n.locale)
      const currentNavItem = localeNavContent
        .find(s => s.chapter === chapter && (s.section || null) === (this.filledContent.meta.section || null) && (s.subsection || null) === (this.filledContent.meta.subsection || null))
      const breadcrumbs = []
      if (currentNavItem) {
        breadcrumbs.push(this.$t(currentNavItem.chapter))
        if (currentNavItem.section) {
          const sectionItem = localeNavContent
            .find(s => s.chapter === chapter && s.section === currentNavItem.section && !s.subsection)
          breadcrumbs.push(sectionItem.title)
          if (currentNavItem.subsection) {
            const subsectionItem = localeNavContent
              .find(s => s.chapter === chapter && s.section === currentNavItem.section && s.subsection === currentNavItem.subsection)
            breadcrumbs.push(subsectionItem.title)
          }
        }
      }
      return breadcrumbs
    }
  },
  async mounted () {
    for (const iframe of this.$el.querySelectorAll('.mermaid-iframe')) {
      window.iFrameResize({}, '#' + iframe.id)
    }
    // Apply classes from vuetify to markdown generated HTML
    const elemClasses = {
      h2: ['display-1', 'my-4'],
      h3: ['title', 'mb-4', 'mt-5'],
      h4: ['subheading', 'mb-3', 'mt-4'],
      p: ['body1'],
      // code: ['theme--light'],
      pre: ['pt-3', 'mb-4', 'px-2']
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
  }
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
      border: 1px solid grey;
    }

    .hidden-breadcrumb {
      display: none;
    }

    ul {
      margin-bottom: 16px;
    }
}
</style>
