<template>
  <v-jsf-base
    v-if="ready"
    :options="options"
    :schema="schema"
    :value="value"
    @input="v => {logEvent('input', v); $emit('input', v)}"
    @change="v => {logEvent('change', v); $emit('change', v)}"
    @input-child="e => logEvent('input-child', e)"
    @change-child="e => logEvent('change-child', e)"
  >
    <template
      v-for="(index, name) in $slots"
      #[name]
    >
      <slot :name="name" />
    </template>
    <template
      v-for="(index, name) in $scopedSlots"
      #[name]="data"
    >
      <slot
        :name="name"
        v-bind="data"
      />
    </template>
  </v-jsf-base>
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
  },
  methods: {
    logEvent (key, e) {
      // console.log('vjsf event', key, e)
    }
  }
}
</script>

<style>

</style>
