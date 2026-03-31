<template lang="html">
  <v-container fluid>
    ...
  </v-container>
</template>

<script>
export default {
  created () {
    this.$router.push('/datasets/' + this.$route.params.id)
  }
}
</script>

<style lang="css">
</style>
