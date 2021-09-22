<template>
  <div>
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
      <h1 class="text-h3 grey--text text--darken-3" style="margin-top:200px;">
        Manuel utilisateur
      </h1>
      <h4 style="margin-top:200px!important;">
        {{ new Date() | moment('DD MMMM YYYY') }}<br>
      </h4>
    </v-col>
    <div class="page-break" />
    <h2 class="text-h4 my-4 grey--text text--darken-3">
      Table des matières
    </h2>
    <template v-for="(section, i) in sections">
      <h4 v-if="!section.meta.subsection" :key="'st-'+i">
        {{ section.meta.section }} - {{ section.meta.title }}
      </h4>
      <h5
        v-else
        :key="'st-'+i"
        class="ml-3"
      >
        {{ section.meta.section }}.{{ section.meta.subsection }} - {{ section.meta.title }}
      </h5>
    </template>
    <template v-for="(section, i) in sections">
      <div
        v-if="!section.meta.subsection"
        :key="'pb-'+i"
        class="page-break"
      />
      <h2
        v-if="!section.meta.subsection"
        :key="'t-'+i"
        class="text-h4 my-4 grey--text text--darken-3"
      >
        {{ section.meta.section }} - {{ section.meta.title }}
      </h2>
      <h3
        v-else
        :key="'t-'+i"
        class="text-h5 my-4 grey--text text--darken-3"
      >
        {{ section.meta.section }}.{{ section.meta.subsection }} - {{ section.meta.title }}
      </h3>
      <div
        :key="'c-'+i"
        class="article"
        v-html="section.html"
      />
    </template>
  </div>
</template>

<script>
  const marked = require('@hackmd/meta-marked')
  const context = require.context('../user-guide/', true, /\.md$/)
  const version = require('../../../package.json').version

  export default {
    layout: 'void',
    data: () => ({
      version,
    }),
    computed: {
      sections() {
        if (!this.$route) return
        const sections = context.keys().filter(k => k.includes('-fr.md')).map(k => Object.assign(marked(context(k).default) || {}, { id: k.split('/')[1].split('.').shift().replace('-fr', '') }))
        sections.sort((s1, s2) => {
          if (s1.meta.section < s2.meta.section) return -1
          else if (s1.meta.section > s2.meta.section) return 1
          else {
            if (!s1.meta.subsection || s1.meta.subsection < s2.meta.subsection) return -1
            else return 1
          }
        })
        return sections
      },
    },
    mounted () {
      // Apply classes from vuetify to markdown generated HTML
      const elemClasses = {
        h2: ['headline', 'font-weight-bold', 'grey--text', 'text--darken-3', 'my-4'],
        h3: ['title', 'font-weight-bold', 'grey--text', 'text--darken-3', 'my-3'],
        h4: ['subheading', 'font-weight-bold', 'grey--text', 'text--darken-3', 'my-2'],
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
      this.$el.querySelectorAll('img').forEach(img => {
        img.parentElement.classList.add('text-center')
      })
    },
  }
</script>

<style>
/* .article img{
  max-width:90%;
  box-shadow: 0px 3px 3px -2px rgba(0,0,0,0.2), 0px 3px 4px 0px rgba(0,0,0,0.14), 0px 1px 8px 0px rgba(0,0,0,0.12);
  margin:30px;
} */

/* .article p em{
  display: flex;
  justify-content: center;
  flex-direction: column;
  text-align: center;
  margin-top: -20px;
  color: rgba(0,0,0,0.6);
} */

.article h2{
  margin-top: 24px;
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 400;
  line-height: 32px;
  font-family: 'Nunito';

}

.caption {
  width: 100%;
  text-align: center;
}

p img {
  max-width:80%;
  margin: 12px auto;
  border: solid;
  border-width: 1px;
}

.page-break{
  page-break-after: always;
}
</style>
