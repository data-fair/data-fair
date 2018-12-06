<template lang="html">
  <doc-page :page="$route.params.id" :pages="pages" :content="content" prefix="user-guide"/>
</template>

<script>
import DocPage from '../../components/DocPage'
// Webpack way of requiring a bunch of modules at once
const context = require.context('.', true, /\.md$/)

export default {
  components: { DocPage },
  data: () => ({
    pages: ['introduction', 'dataset', 'format', 'concepts', 'permission', 'service', 'application', 'enrichment', 'catalog']
  }),
  head() {
    const meta = [{ hid: 'robots', name: 'robots', content: 'index' }]
    return { meta }
  },
  computed: {
    content() {
      if (!this.$route) return
      const content = context(`./${this.$route.params.id}-${this.$i18n.locale}.md`) || context(`./${this.$route.params.id}-fr.md`)
      return content
    }
  }
}
</script>
