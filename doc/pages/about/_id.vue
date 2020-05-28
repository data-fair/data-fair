<template lang="html">
  <doc-page
    :page="$route.params.id"
    :pages="pages"
    :content="content"
    prefix="about"
  />
</template>

<script>
  import DocPage from '../../components/DocPage'

  // Webpack way of requiring a bunch of modules at once
  const context = require.context('.', true, /\.md$/)

  export default {
    components: { DocPage },
    data: () => ({
      pages: ['overview', 'technical-overview', 'license'],
    }),
    computed: {
      content() {
        if (!this.$route) return
        const content = context(`./${this.$route.params.id}-${this.$i18n.locale}.md`) || context(`./${this.$route.params.id}-fr.md`)
        return content
      },
    },
  }
</script>
