<template>
  <v-list-item
    :href="url"
    :nuxt="true"
    class="pr-0"
  >
    <v-list-item-avatar class="brand-logo">
      <img
        v-if="logo"
        :src="logo"
      >
      <img
        v-else
        src="~/assets/logo.png"
      >
    </v-list-item-avatar>
    <v-list-item-title v-if="!$vuetify.breakpoint.mobile">
      <h1
        class="text-h5 font-weight-bold"
        style="text-overflow: ellipsis; white-space: nowrap; overflow: hidden;"
      >
        {{ title }}
      </h1>
    </v-list-item-title>
  </v-list-item>
</template>

<script>
import { mapState } from 'vuex'
export default {
  computed: {
    ...mapState(['env', 'siteInfo']),
    logo () {
      if (!this.siteInfo.main) return this.siteInfo.theme.logo
      if (this.env.logo) return this.env.logo
      return null
    },
    title () {
      if (!this.siteInfo.main) return this.siteInfo.title
      return this.env.brand.title || 'DataFair'
    },
    url () {
      if (!this.siteInfo.main) return '/'
      return this.env.brand.url ?? '/'
    }
  }
}
</script>

<style lang="css">
.brand-logo.v-avatar {
  border-radius: 0;
  overflow: visible;
}
.brand-logo.v-avatar img {
  width: 40px !important;
  height: 40px !important;
}
</style>
