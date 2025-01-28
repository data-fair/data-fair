<template>
  <v-card v-bind="cardProps">
    <v-card-title
      style="word-break:normal;line-break:1.5rem;"
      class="justify-center"
      :class="{'pb-0': !!svg, [color + '--text']: !!to}"
    >
      {{ title }}
    </v-card-title>

    <layout-wrap-svg
      :source="svg"
      style="width:100%;padding-left:34px;padding-right:34px;margin-top:-16px;margin-bottom: -20px;"
      :color="$vuetify.theme.themes.light[color] || color"
    />
  </v-card>
</template>

<script>
export default {
  props: {
    to: { type: [Object, String], default: null },
    svg: { type: String, required: true },
    title: { type: String, required: true },
    color: { type: String, default: 'primary' }
  },
  computed: {
    cardProps () {
      const props = {
        outlined: true,
        tile: true
      }
      if (this.to) {
        props.to = this.to
        props.hover = true
      }
      return props
    }
  }
}
</script>

<style>

</style>
