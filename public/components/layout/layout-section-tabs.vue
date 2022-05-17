<template>
  <v-sheet
    v-if="section"
    :id="section.id"
    :style="style"
    :class="`mt-3 mb-10 section-tabs section-tabs-${$vuetify.theme.dark ? 'dark' : 'light'}`"
    style="position: relative"
    color="transparent"
  >
    <v-toolbar
      extended
      rounded
      flat
      outlined
      :color="toolbarColor"
      :style="toolbarStyle"
      class="mb-2 section-active"
      :extension-height="extensionHeight"
    >
      <v-toolbar-title
        :class="{'text-h5': true, 'admin--text': admin}"
        @click="toggle"
      >
        <slot name="title">
          {{ section.title }}
        </slot>
      </v-toolbar-title>
      <template #extension>
        <slot name="extension">
          <v-tabs
            v-model="tab"
            :optional="false"
            style="margin-bottom: 1px;"
            show-arrows
          >
            <slot name="tabs">
              <v-tab
                v-for="child in section.children"
                :key="child.id"
                :href="`#${section.id}-${child.id}`"
              >
                <v-icon
                  v-if="child.icon"
                  v-text="child.icon"
                />&nbsp;&nbsp;{{ child.title }}
              </v-tab>
            </slot>
          </v-tabs>
        </slot>
      </template>
    </v-toolbar>
    <v-tabs-items v-model="tab">
      <slot name="tabs-items" />
    </v-tabs-items>

    <layout-wrap-svg
      v-if="showSvg"
      :source="svg"
      :style="svgStyle"
      :color="$vuetify.theme.themes.light.primary"
    />
  </v-sheet>
</template>

<script>
export default {
  props: {
    minHeight: { type: Number, default: null },
    defaultTab: { type: String, default: null },
    texture: { type: String, default: null },
    svg: { type: String, default: null },
    svgNoMargin: { type: Boolean, default: false },
    section: { type: Object, required: true },
    admin: { type: Boolean, default: false },
    extensionHeight: { type: Number, default: 48 }
  },
  data: () => ({
    tab: null
  }),
  computed: {
    showSvg () {
      return !!this.svg && this.$vuetify.breakpoint.mdAndUp
    },
    style () {
      if (!this.tab || !this.minHeight) return ''
      return `min-height: ${92 + this.minHeight}px;`
    },
    toolbarColor () {
      if (this.admin) return 'admin'
      return this.$vuetify.theme.dark ? 'transparent' : 'grey lighten-4'
    },
    toolbarStyle () {
      let css = ''
      if (this.showSvg) css += 'padding-left: 160px;'
      if (this.texture) {
        // const textureUrl = `${process.env.publicUrl}/textures/${this.texture}/${this.texture}.png`
        const textureUrl = `https://www.transparenttextures.com/patterns/${this.texture}.png`
        css += `background-repeat: repeat; background-image: url("${textureUrl}");`
      }
      return css
    },
    svgStyle () {
      if (!this.svg) return
      let style = 'position: absolute;'
      if (this.svgNoMargin) {
        style += 'height: 110px;left: 4px;top:0px;'
      } else {
        style += 'height: 94px;left: 12px;top:8px;'
      }
      return style
    }
  },
  created () {
    if (this.defaultTab) this.tab = this.defaultTab
  },
  methods: {
    toggle () {
      if (this.tab) this.tab = null
    }
  }
}
</script>

<style lang="css">
.section-tabs-light .section-active {
  background: linear-gradient(90deg, rgba(255,255,255,1) 0%, rgba(245,245,245,1) 30%);
}
</style>
