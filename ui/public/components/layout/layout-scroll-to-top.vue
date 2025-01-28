<!-- inspired by https://github.com/vuetifyjs/vuetify/blob/8bb752b210d25fbebcea12cd073d2ce4986f5e12/packages/docs/src/layouts/default/FabToTop.vue -->

<template>
  <v-fab-transition>
    <v-btn
      v-show="show"
      title="Remonter au début de la page"
      aria-label="Remonter au début de la page"
      bottom
      class="transition-swing"
      color="primary"
      fab
      fixed
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
  props: {
    selector: { type: String, required: false, default: null }
  },
  data: () => ({ show: false }),
  mounted () {
    this._scrollElement = this.selector ? document.querySelector(this.selector) : window
    this._scrollElement.addEventListener('scroll', this.onScroll)
  },
  destroyed () {
    if (this._scrollElement) {
      this._scrollElement.removeEventListener('scroll', this.onScroll)
    }
  },
  methods: {
    onScroll (e) {
      const top = this.selector ? e.target.scrollTop : (window.pageYOffset || document.documentElement.offsetTop || 0)
      this.show = top > 300
    },
    toTop () {
      if (this.selector) {
        // WARNING: smooth animation was having some sideeffect on virtual scroll management
        // leave it off
        // this._scrollElement.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
        this._scrollElement.scrollTo({ top: 0, left: 0 })
      } else {
        if (this.$route.hash) this.$router.push({ hash: '' })
        this.$vuetify.goTo(0)
      }
    }
  }
}
</script>
