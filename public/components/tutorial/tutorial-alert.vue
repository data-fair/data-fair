<template lang="html">
  <v-alert
    v-model="show"
    type="info"
    color="success"
    border="left"
    dense
    class="my-2 tutorial-alert"
    :dismissible="true"
    @input="close"
  >
    <slot />
  </v-alert>
</template>

<script>
export default {
  props: { id: { type: String, required: true } },
  data: () => ({
    show: false
  }),
  mounted () {
    if (global.localStorage) {
      if (global.localStorage['closed-tutorial-' + this.id] !== 'true') {
        this.show = true
      }
    }
  },
  methods: {
    close () {
      global.localStorage['closed-tutorial-' + this.id] = 'true'
    }
  }
}
</script>

<style lang="css" scoped>
</style>
