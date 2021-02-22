<template>
  <v-card
    :style="style"
    class="mt-3 mb-6 section-tabs"
  >
    <v-toolbar
      dark
      extended
      dense
      :color="tab ? 'primary' : ''"
      extension-height="44"
      elevation="0"
      :style="toolbarStyle"
      :class="tab ? 'section-active' : ''"
    >
      <v-toolbar-title class="text-h6 font-weight-bold" @click="toggle">
        <slot name="title" />
      </v-toolbar-title>
      <template v-slot:extension>
        <v-tabs
          v-model="tab"
          right
          height="44"
          :optional="true"
        >
          <slot name="tabs" />
        </v-tabs>
      </template>
    </v-toolbar>
    <v-tabs-items v-model="tab">
      <slot name="tabs-items" />
    </v-tabs-items>
  </v-card>
</template>

<script>
  export default {
    props: {
      minHeight: { type: Number },
      defaultTab: { type: String },
      texture: { type: String },
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
        if (!this.texture) return ''
        // const textureUrl = `${process.env.publicUrl}/textures/${this.texture}/${this.texture}.png`
        const textureUrl = `https://www.transparenttextures.com/patterns/${this.texture}.png`
        return `background-repeat: repeat; background-image: url("${textureUrl}")`
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

<style lang="css" scoped>
</style>
