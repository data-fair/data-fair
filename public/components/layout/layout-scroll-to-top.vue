<!-- inspired by https://github.com/vuetifyjs/vuetify/blob/8bb752b210d25fbebcea12cd073d2ce4986f5e12/packages/docs/src/layouts/default/FabToTop.vue -->

<template>
  <v-fab-transition>
    <v-btn
      v-show="fab && $vuetify.breakpoint.smAndDown"
      v-scroll="onScroll"
      title="Remonter au début de la page"
      aria-label="Remonter au début de la page"
      bottom
      class="transition-swing"
      color="primary"
      fab
      fixed
      large
      right
      style="z-index: 6"
      @click="toTop"
    >
      <v-icon>mdi-chevron-up</v-icon>
    </v-btn>
  </v-fab-transition>
</template>

<script>
export default {
  data: () => ({ fab: false }),
  methods: {
    onScroll () {
      const top = window.pageYOffset || document.documentElement.offsetTop || 0
      this.fab = top > 300
    },
    toTop () {
      if (this.$route.hash) this.$router.push({ hash: '' })
      this.$vuetify.goTo(0)
    }
  }
}
</script>
