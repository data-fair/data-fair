<template>
  <!-- a little bit of dynamic css -->
  <!-- cf https://stackoverflow.com/a/57331310 -->
  <component :is="'style'">
    html {
    overflow-y: {{ htmlOverflow }} !important;
    }
    .v-btn.primary.theme--light {
    background: linear-gradient(90deg, {{ env.theme.colors.primary }} 0%, {{ darkPrimary10 }} 100%);
    }
    .v-btn.primary.theme--dark {
    background: linear-gradient(90deg, {{ darkPrimary10 }} 0%, {{ env.theme.colors.primary }} 100%);
    }
    .v-application.theme--light .v-btn.primary.v-btn--has-bg {
    border: 1px solid {{ darkPrimary10 }} !important;
    }
    .v-application.theme--dark .v-btn.primary.v-btn--has-bg {
    border: 1px solid {{ env.theme.colors.primary }} !important;
    }
    .v-application.theme--light .navigation-left {
    border-top: 2px solid {{ darkPrimary10 }} !important;
    border-right: 2px solid {{ darkPrimary10 }} !important;
    }
    .v-application.theme--dark .navigation-left {
    border-top: 2px solid {{ env.theme.colors.primary }} !important;
    border-right: 2px solid {{ env.theme.colors.primary }} !important;
    }
  </component>
</template>

<script>
const { mapState, mapGetters } = require('vuex')

export default {
  props: {
    // defined here as the css rules from default and embed layout are loaded in the same chunk
    htmlOverflow: { type: String, default: 'auto' }
  },
  computed: {
    ...mapState(['env']),
    ...mapGetters(['lightPrimary5', 'darkPrimary5', 'darkPrimary10'])
  }
}
</script>

<style lang="css" scoped>
</style>
