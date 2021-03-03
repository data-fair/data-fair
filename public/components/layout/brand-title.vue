<template>
  <v-list-item
    :href="env.brand.url"
    :nuxt="true"
    class="pr-0"
  >
    <v-list-item-avatar class="brand-logo">
      <img v-if="env.brand.logo" :src="env.brand.logo">
      <img v-else src="~/assets/logo.png">
    </v-list-item-avatar>
    <v-list-item-title v-if="!$vuetify.breakpoint.mobile">
      <h1 class="text-h5 font-weight-bold">
        {{ env.brand.title || 'DataFair' }}
      </h1>
    </v-list-item-title>
  </v-list-item>
</template>

<script>
  import { mapState } from 'vuex'
  export default {
    computed: {
      ...mapState(['env']),
    },
  }
</script>

<style lang="css">
.brand-logo.v-avatar {
  border-radius: 0;
  overflow: visible;
}
.brand-logo.v-avatar img {
  width: 40px !important;
  height: auto !important;
}
</style>
