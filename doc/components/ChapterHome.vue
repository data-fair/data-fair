<template lang="html">
  <v-container class="index-page">
    <h2 class="text-h4 my-6">
      {{ $t(chapter) }}
      <v-btn
        :to="localePath({name: 'full-id', params: {id: chapter}})"
        icon
      >
        <v-icon color="primary">
          mdi-printer
        </v-icon>
      </v-btn>
    </h2>
    <ul style="list-style-type: none;">
      <li
        v-for="(section,i) in sections.filter(s => !s.subsection)"
        :key="`section-${i}`"
        class="mb-5 text-h5"
      >
        <nuxt-link :to="localePath({name: `${chapter}-id`, params: {id: section.id}})">
          {{ i + 1 }} - {{ section.title }}
        </nuxt-link>
        <ul
          style="list-style-type: none;"
          class="my-4"
        >
          <li
            v-for="(subsection, j) in sections.filter(s => s.section === section.section && s.subsection)"
            :key="j"
            class="mt-1 text-h6"
          >
            <nuxt-link
              :to="localePath({name: `${chapter}-id`, params: {id: subsection.id}})"
              class="text-h6"
            >
              {{ i + 1 }}.{{ j + 1 }} - {{ subsection.title }}
            </nuxt-link>
          </li>
        </ul>
      </li>
    </ul>
  </v-container>
</template>

<i18n locale="fr" lang="yaml" src="../i18n/common-fr.yaml"></i18n>
<i18n locale="en" lang="yaml" src="../i18n/common-en.yaml"></i18n>

<script>
const marked = require('@hackmd/meta-marked')
const context = require.context('../pages/', true, /\.md$/)

export default {
  props: ['chapter', 'ignoreLocale'],
  computed: {
    sections () {
      if (!this.$route) return
      console.log(context.keys(), this.chapter, context.keys().filter(k => k.includes(`/${this.chapter}/`)))
      const sections = context.keys()
        .filter(k => k.includes(`/${this.chapter}/`))
        .filter(k => this.ignoreLocale || k.includes(`-${this.$i18n.locale}.md`))
        .map(k => {
          const content = context(k).default
          return {
            id: k.split('/').pop().split('.').shift().replace(`-${this.$i18n.locale}`, ''),
            ...marked(context(k).default).meta,
            content
          }
        })
      console.log(sections)
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
