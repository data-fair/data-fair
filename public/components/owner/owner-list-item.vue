<template>
  <v-list-item>
    <v-list-item-avatar class="ml-0 my-0">
      <v-avatar :size="28">
        <img :src="`${env.directoryUrl}/api/avatars/${owner.type}/${owner.id}/avatar.png`">
      </v-avatar>
    </v-list-item-avatar>
    <span>{{ owner.name }}</span>
    <span v-if="owner.role">&nbsp;(rôle {{ owner.role }})</span>
  </v-list-item>
</template>

<script>
  import { mapState } from 'vuex'

  export default {
    props: ['owner'],
    computed: {
      ...mapState(['env']),
    },
  }
</script>

<style lang="css" scoped>
</style>
