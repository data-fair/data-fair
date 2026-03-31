<template>
  <v-list-item
    :href="env.brand.url"
    :nuxt="true"
    class="pr-0"
  >
    <v-list-item-avatar class="brand-logo">
      <img
        v-if="env.logo"
        :src="env.logo"
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
        {{ env.brand.title || 'Data Fair' }}
      </h1>
    </v-list-item-title>
  </v-list-item>
</template>

<script>
import { mapState } from 'vuex'
export default {
  computed: {
    ...mapState(['env'])
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
