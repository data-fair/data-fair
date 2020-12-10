<template lang="html">
  <doc-page :content="content" />
</template>

<script>
  import DocPage from '../../components/DocPage'
  // Webpack way of requiring a bunch of modules at once
  const context = require.context('.', true, /\.md$/)

  export default {
    components: { DocPage },
    computed: {
      content() {
        if (!this.$route) return
        const content = context(`./${this.$route.params.id}-${this.$i18n.locale}.md`) || context(`./${this.$route.params.id}-fr.md`)
        return content.default
      },
    },
    head() {
      const meta = [{ hid: 'robots', name: 'robots', content: 'index' }]
      return { meta }
    },
  }
</script>
