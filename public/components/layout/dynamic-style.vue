<template>
  <!-- a little bit of dynamic css -->
  <!-- cf https://stackoverflow.com/a/57331310 -->
  <component :is="'style'">
    html {
    overflow-y: {{ htmlOverflow }} !important;
    }
    .v-btn.primary {
    background: linear-gradient(90deg, {{ lightPrimary5 }} 0%, {{ darkPrimary5 }} 100%);
    }
  </component>
</template>

<script>
  const { mapGetters } = require('vuex')

  export default {
    props: {
      // defined here as the css rules from default and embed layout are loaded in the same chunk
      htmlOverflow: { type: String, default: 'auto' },
    },
    computed: {
      ...mapGetters(['lightPrimary5', 'darkPrimary5']),
    },
  }
</script>

<style lang="css" scoped>
</style>
