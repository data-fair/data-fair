<template lang="html">
  <doc-page
    :content="content"
    :only-french="true"
  />
</template>

<script>
import DocPage from '~/components/DocPage'
// Webpack way of requiring a bunch of modules at once
const context = require.context('./', true, /\.md$/)

export default {
  components: { DocPage },
  computed: {
    content () {
      if (!this.$route) return
      const content = context(`./${this.$route.params.id}.md`)
      return content.default
    }
  }
}
</script>
