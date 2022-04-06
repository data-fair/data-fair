<template>
  <ul style="list-style-type: none;">
    <li
      v-for="(section,i) in sections.filter(s => !s.subsection)"
      :key="`section-${i}`"
      class="mb-5 text-h5"
    >
      <nuxt-link :to="localePath({name: `${name}-id`, params: {id: section.id}})">
        {{ i +1 }} - {{ section.title }}
      </nuxt-link>
      <ul style="list-style-type: none;">
        <li
          v-for="(subsection, j) in sections.filter(s => s.section === section.section && s.subsection)"
          :key="j"
          class="mt-1 text-h6"
        >
          <nuxt-link
            :to="localePath({name: `${name}-id`, params: {id: subsection.id}})"
            class="text-h6"
          >
            {{ i +1 }}.{{ j +1 }} - {{ subsection.title }}
          </nuxt-link>
        </li>
      </ul>
    </li>
  </ul>
</template>

<script>
const marked = require('@hackmd/meta-marked')

export default {
  props: ['context', 'name', 'ignoreLocale'],
  computed: {
    sections () {
      if (!this.$route) return
      const sections = this.context.keys()
        .filter(k => {
          if (this.ignoreLocale) return true
          return k.includes(`-${this.$i18n.locale}.md`)
        })
        .map(k => Object.assign(marked(this.context(k).default).meta || {}, {
          id: k.split('/')[1].split('.').shift().replace(`-${this.$i18n.locale}`, '')
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
    }
  }
}
</script>

<style>

</style>
