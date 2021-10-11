<template lang="html">
  <v-container class="index-page">
    <h2 class="text-h4 my-6">
      Architecture technique
      <v-btn :to="localePath({name: 'full-technical-architecture'})" icon>
        <v-icon color="primary">
          mdi-printer
        </v-icon>
      </v-btn>
    </h2>
    <v-row v-for="(section, i) in sections.filter(s => !s.subsection)" :key="i">
      <v-col>
        <nuxt-link :to="localePath({name: `technical-architecture-id`, params: {id: section.id}})" class="text-h5">
          {{ i +1 }} - {{ section.title }}
        </nuxt-link>
        <v-row
          v-for="(subsection, j) in sections.filter(s => s.section === section.section && s.subsection)"
          :key="j"
          class="px-6"
        >
          <nuxt-link :to="localePath({name: `technical-architecture-id`, params: {id: subsection.id}})" class="text-h6">
            {{ i +1 }}.{{ j +1 }} - {{ subsection.title }}
          </nuxt-link>
        </v-row>
      </v-col>
    </v-row>
    <!-- {{ sections }} -->
  </v-container>
</template>

<script>
  const marked = require('@hackmd/meta-marked')
  const context = require.context('./', true, /\.md$/)

  export default {
    computed: {
      sections() {
        if (!this.$route) return
        const sections = context.keys()
          .filter(k => k.includes(`-${this.$i18n.locale}.md`))
          .map(k => Object.assign(marked(context(k).default).meta || {}, {
            id: k.split('/')[1].split('.').shift().replace(`-${this.$i18n.locale}`, ''),
          }))
        sections.sort((s1, s2) => {
          if (s1.section < s2.section) return -1
          else if (s1.section > s2.section) return 1
          else {
            if (s1.subsection < s2.subsection) return -1
            else return 1
          }
        })
        return sections
      },
    },
  }
</script>
