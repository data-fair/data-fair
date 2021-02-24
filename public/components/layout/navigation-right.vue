<template>
  <v-navigation-drawer
    class="navigation-right"
    right
    permanent
    clipped
    floating
    fixed
    style="padding-top: 50px"
    color="transparent"
  >
    <slot />
  </v-navigation-drawer>
</template>

<script>
  export default {}
</script>

<style lang="css" scoped>
.main-logo img {
  width: 40px;
  height: auto;
}
</style>
