<template lang="html">
  <v-container fluid>
    ...
  </v-container>
</template>

<script>
// we keep this page for compatibility, but it is a simple redirect
export default {
  created () {
    this.$router.push('/application/' + this.$route.params.id)
  }
}
</script>

<style lang="css">
</style>
