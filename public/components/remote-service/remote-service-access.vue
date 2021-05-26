<template lang="html">
  <v-row>
    <v-col cols="12">
      <private-access :patch="remoteService" @change="patch({public: remoteService.public, privateAccess: remoteService.public ? [] : remoteService.privateAccess})" />
    </v-col>
  </v-row>
</template>

<script>
  const { mapState, mapActions } = require('vuex')

  export default {
    computed: {
      ...mapState('remoteService', ['remoteService']),
    },
    methods: {
      ...mapActions('remoteService', ['patch']),
    },
  }
</script>

<style lang="css">
</style>
