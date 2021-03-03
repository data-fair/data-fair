<template>
  <!-- a little bit of dynamic css -->
  <!-- cf https://stackoverflow.com/a/57331310 -->
  <component :is="'style'">
    .v-btn.primary {
    background: linear-gradient(90deg, {{ lightPrimary5 }} 0%, {{ darkPrimary5 }} 100%);
    }
  </component>
</template>

<script>
  const { mapGetters } = require('vuex')

  export default {
    computed: {
      ...mapGetters(['lightPrimary5', 'darkPrimary5']),
    },
  }
</script>

<style lang="css" scoped>
</style>
