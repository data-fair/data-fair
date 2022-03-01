<template>
  <v-tooltip
    v-if="!!href"
    left
  >
    <template #activator="{on}">
      <v-btn
        icon
        :href="href"
        target="_blank"
        :style="style"
        v-on="on"
      >
        <v-icon>mdi-help</v-icon>
      </v-btn>
    </template>
    {{ tooltip }}
  </v-tooltip>
</template>

<script>
import { mapState } from 'vuex'
export default {
  props: ['tooltip', 'docKey', 'docHref', 'offset'],
  computed: {
    ...mapState(['env']),
    href () {
      return this.docHref || (this.docKey && this.env.doc[this.docKey])
    },
    style () {
      let style = 'position: absolute;'
      if (this.offset === 'bottom') style += ' top: 60px;'
      else style += ' top: 8px;'

      if (this.offset === 'left') style += 'right: 60px;'
      else style += ' right: 8px;'

      return style
    }
  }
}
</script>

<style lang="css" scoped>
</style>
