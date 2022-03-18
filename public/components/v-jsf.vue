<template>
  <v-jsf-base
    v-if="ready"
    :options="options"
    :schema="schema"
    :value="value"
    @input="v => $emit('input', v)"
    @change="v => $emit('change', v)"
  />
</template>

<script>
// a simple wrapper to prevent duplicating import lines, and help nuxt manage code splitting
import 'easymde/dist/easymde.min.css'
import VJsfBase from '@koumoul/vjsf/lib/VJsf.js'
import '@koumoul/vjsf/lib/deps/third-party.js'
import '@koumoul/vjsf/dist/main.css'
export default {
  components: { VJsfBase },
  props: ['options', 'schema', 'value'],
  data () {
    return { ready: false }
  },
  async mounted () {
    window.EasyMDE = (await import('easymde/src/js/easymde.js')).default
    this.ready = true
  }
}
</script>

<style>

</style>
