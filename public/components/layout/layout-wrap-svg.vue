<template>
  <div
    class="svg-wrap"
    v-html="themedSource"
  />
</template>

<script>
export default {
  props: {
    source: { type: String, required: true },
    color: { type: String, default: null },
    secondaryColor: { type: String, default: null }
  },
  computed: {
    themedSource () {
      if (!this.color) return this.source
      return this.source
        .replace(/#6C63FF/gi, this.color || this.$vuetify.theme.themes.light.primary) // default undraw color
        .replace(/#68E1FD/gi, this.color || this.$vuetify.theme.themes.light.primary) // default manypixels color
        .replace(/#FFD200/gi, this.secondaryColor || this.$vuetify.theme.themes.light.accent)
    }
  }
}
</script>

<style lang="css">
div.svg-wrap {
  height: 100%;
}
div.svg-wrap svg {
  height: inherit;
  width: inherit;
}
</style>
