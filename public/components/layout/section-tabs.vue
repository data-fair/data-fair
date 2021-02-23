<template>
  <v-sheet
    :style="style"
    :class="`mt-3 mb-10 section-tabs section-tabs-${$vuetify.theme.dark ? 'dark' : 'light'}`"
    style="position: relative"
    color="transparent"
  >
    <v-toolbar
      extended
      rounded
      :flat="$vuetify.theme.dark"
      elevation="3"
      :color="$vuetify.theme.dark ? 'transparent' : 'grey lighten-4'"
      :style="toolbarStyle"
      :class="tab ? 'section-active mb-2' : ''"
    >
      <v-toolbar-title class="text-h5" @click="toggle">
        <slot name="title" />
      </v-toolbar-title>
      <template v-slot:extension>
        <v-tabs
          v-model="tab"
          :optional="false"
        >
          <slot name="tabs" />
        </v-tabs>
      </template>
    </v-toolbar>
    <v-tabs-items v-model="tab">
      <slot name="tabs-items" />
    </v-tabs-items>

    <wrap-svg
      v-if="svg"
      :source="svg"
      style="height: 94px;position: absolute;left: 12px; top: 8px;"
      :color="$vuetify.theme.themes.light.primary"
    />
  </v-sheet>
</template>

<script>
  import WrapSvg from '~/components/layout/svg.vue'
  export default {
    components: {
      WrapSvg,
    },
    props: {
      minHeight: { type: Number },
      defaultTab: { type: String },
      texture: { type: String },
      svg: { type: String },
    },
    data: () => ({
      tab: null,
    }),
    computed: {
      style() {
        if (!this.tab || !this.minHeight) return ''
        return `min-height: ${92 + this.minHeight}px;`
      },
      toolbarStyle() {
        let css = ''
        if (this.svg) css += 'padding-left: 160px;'
        if (this.texture) {
          // const textureUrl = `${process.env.publicUrl}/textures/${this.texture}/${this.texture}.png`
          const textureUrl = `https://www.transparenttextures.com/patterns/${this.texture}.png`
          css += `background-repeat: repeat; background-image: url("${textureUrl}");`
        }
        return css
      },
    },
    created() {
      if (this.defaultTab) this.tab = this.defaultTab
    },
    methods: {
      toggle() {
        if (this.tab) this.tab = null
      },
    },
  }
</script>

<style lang="css">
.section-tabs-light .section-active{
  background: linear-gradient(90deg, rgba(255,255,255,1) 0%, rgba(245,245,245,1) 30%);
}
</style>
