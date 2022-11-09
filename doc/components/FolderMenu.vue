<template lang="html">
  <v-list
    dense
    expand
  >
    <template v-for="(chapter, i) in chapters">
      <v-list-group
        :key="chapter.id"
        no-action
        :value="i === 0"
      >
        <v-list-item
          slot="activator"
          :to="localePath({name: chapter.id})"
          nuxt
          exact
        >
          <!-- <v-list-item-action>
                  <v-icon>mdi-information-outline</v-icon>
                </v-list-item-action> -->
          <v-list-item-title>
            {{ chapter.title }}
          </v-list-item-title>
        </v-list-item>
        <template v-for="section in content.filter(c => c.chapter === chapter.id && !c.subsection)">
          <v-list-item
            v-if="!content.filter(c => c.chapter === chapter.id && c.section == section.section && c.subsection).length"
            :key="section.id"
            :to="localePath({name: `${chapter.id}-id`, params: {id: section.id}})"
          >
            <v-list-item-title>
              {{ section.title || section.id }}
              <v-icon
                v-if="!section.published"
                color="error"
                small
              >
                mdi-alert
              </v-icon>
            </v-list-item-title>
          </v-list-item>

          <v-list-group
            v-else
            :key="section.id"
            no-action
            sub-group
          >
            <v-list-item
              slot="activator"
              :to="localePath({name: `${chapter.id}-id`, params: {id: section.id}})"
              nuxt
            >
              <v-list-item-title>
                {{ section.title }}
              </v-list-item-title>
            </v-list-item>
            <v-list-item
              v-for="subsection in content.filter(c => c.chapter === chapter.id && c.section == section.section && c.subsection)"
              :key="subsection.id"
              :to="localePath({name: `${chapter.id}-id`, params: {id: subsection.id}})"
            >
              <v-list-item-title>
                {{ subsection.title }}
                <v-icon
                  v-if="!subsection.published"
                  color="error"
                  small
                >
                  mdi-alert
                </v-icon>
              </v-list-item-title>
            </v-list-item>
          </v-list-group>
        </template>
      </v-list-group>
    </template>
  </v-list>
</template>

<i18n locale="fr" lang="yaml" src="../i18n/common-fr.yaml"></i18n>
<i18n locale="en" lang="yaml" src="../i18n/common-en.yaml"></i18n>

<script>
const marked = require('@hackmd/meta-marked')

export default {
  props: ['folder'],
  computed: {
    content () {
      if (!this.$route) return
      const context = require.context('../pages/', true, /\.md$/)
      const content = context.keys()
        .filter(k => {
          if (k.startsWith('./install')) return true
          if (k.startsWith('./interoperate')) return true
          if (k.startsWith('./technical-architecture')) return true
          return k.includes(`-${this.$i18n.locale}.md`)
        })
        .map(k => Object.assign(marked(context(k).default).meta || {}, {
          chapter: k.split('/')[1],
          id: k.split('/')[2].split('.').shift().replace(`-${this.$i18n.locale}`, '')
        }))
        .filter(section => section.published || !process.env.hideDraft)
      content.sort((s1, s2) => {
        if (this.chapters.findIndex(c => c.id === s1.chapter) < this.chapters.findIndex(c => c.id === s2.chapter)) return -1
        else if (this.chapters.findIndex(c => c.id === s1.chapter) > this.chapters.findIndex(c => c.id === s2.chapter)) return 1
        else if (s1.section && !s2.section) return -1
        else if (!s1.section && s2.section) return 1
        else if (s1.section < s2.section) return -1
        else if (s1.section > s2.section) return 1
        else if (s1.subsection && !s2.subsection) return -1
        else if (!s1.subsection && s2.subsection) return 1
        else if (s1.subsection < s2.subsection) return -1
        else return 1
      })
      return content
    },
    chapters () {
      return [
        {
          id: 'functional-presentation',
          title: this.$t('functional-presentation')
        },
        {
          id: 'user-guide-backoffice',
          title: this.$t('user-guide-backoffice')
        },
        {
          id: 'user-guide-frontoffice',
          title: this.$t('user-guide-frontoffice')
        },
        {
          id: 'lessons',
          title: this.$t('lessons')
        },
        {
          id: 'technical-architecture',
          title: this.$t('technical-architecture')
        },
        {
          id: 'interoperate',
          title: this.$t('interoperate')
        },
        {
          id: 'install',
          title: this.$t('install')
        }
      ]
    }
  }
}
</script>
