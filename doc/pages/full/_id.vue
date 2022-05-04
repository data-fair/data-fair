<template lang="html">
  <div class="full-chapter">
    <!-- 1rst title page -->
    <v-col class="mt-6 pt-6 text-center">
      <v-img
        height="160px"
        contain
        src="./logo.svg"
        class="my-6"
      />
      <h1 class="text-h3 grey--text text--darken-3">
        Data Fair
      </h1>
      <h4>
        Version {{ version }}
      </h4>
      <h1
        v-t="$route.params.id"
        class="text-h3 grey--text text--darken-3"
        style="margin-top:200px;"
      />
      <h4 style="margin-top:200px!important;">
        {{ new Date() | moment('DD MMMM YYYY') }}<br>
      </h4>
    </v-col>
    <div class="page-break" />

    <!-- TOC -->
    <v-row
      justify="center"
      class="mt-6"
    >
      <div>
        <h2
          v-t="'tableOfContents'"
          class="text-h4 my-4 grey--text text--darken-3"
        />
        <template v-for="(section, i) in sections">
          <h4
            v-if="!section.subsection"
            :key="'st-'+i"
          >
            {{ section.section }} - {{ section.title }}
          </h4>
          <h5
            v-else
            :key="'st-'+i"
            class="ml-3"
          >
            {{ section.section }}.{{ section.subsection }} - {{ section.title }}
          </h5>
        </template>
      </div>
    </v-row>
    <div class="page-break" />

    <template v-for="(section, i) in sections">
      <div
        v-if="!section.subsection"
        :key="'pb-'+i"
        class="page-break"
      />
      <h2
        v-if="!section.subsection"
        :key="'t-'+i"
        class="text-h4 my-4 grey--text text--darken-3 section-title"
      >
        {{ section.section }} - {{ section.title }}
      </h2>
      <h3
        v-else
        :key="'t-'+i"
        class="text-h5 my-4 grey--text text--darken-3 section-title subsection-title"
      >
        {{ section.section }}.{{ section.subsection }} - {{ section.title }}
      </h3>
      <doc-page
        :key="'page-'+i"
        :content="section.content"
        :hide-title="true"
      />
    </template>
  </div>
</template>

<i18n locale="fr" lang="yaml" src="../../i18n/common-fr.yaml"></i18n>
<i18n locale="en" lang="yaml" src="../../i18n/common-en.yaml"></i18n>

<script>
import DocPage from '~/components/DocPage'
const marked = require('@hackmd/meta-marked')
const context = require.context('../', true, /\.md$/)
const version = require('../../../package.json').version

export default {
  components: { DocPage },
  layout: 'void',
  data () {
    return { version }
  },
  head () {
    return {
      title: 'Data Fair - ' + this.$t(this.$route.params.id)
    }
  },
  computed: {
    sections () {
      if (!this.$route) return
      const sections = context.keys()
        .filter(k => k.includes(`/${this.$route.params.id}/`))
        .filter(k => {
          if (k.startsWith('./install')) return true
          if (k.startsWith('./interoperate')) return true
          if (k.startsWith('./technical-architecture')) return true
          return k.includes(`-${this.$i18n.locale}.md`)
        })
        .map(k => {
          const content = context(k).default
          return {
            id: k.split('/')[1].split('.').shift().replace(`-${this.$i18n.locale}`, ''),
            ...marked(context(k).default).meta,
            content
          }
        })
      sections.sort((s1, s2) => {
        if (s1.section < s2.section) return -1
        else if (s1.section > s2.section) return 1
        else {
          if (!s1.subsection || s1.subsection < s2.subsection) return -1
          else return 1
        }
      })
      return sections
    }
  }
}
</script>

<style>

.page-break{
  page-break-after: always;
}

.full-chapter .container.doc-page {
  margin-left: 0px;
  margin-right: 0px;
  max-width: 100%;
}

h2,h3,h4,h5 {
  break-after: avoid;
}

</style>
