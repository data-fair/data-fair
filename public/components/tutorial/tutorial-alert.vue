<template lang="html">
  <v-alert
    v-model="show"
    :type="$vuetify.smAndUp ? 'info' : null"
    dark
    color="success"
    dense
    border="left"
    class="my-2 tutorial-alert"
    :dismissible="true"
    :outlined="$vuetify.theme.dark"
    :style="$vuetify.theme.dark ? 'background: black !important' : ''"
    @input="close"
  >
    <slot>
      <a
        v-if="href"
        :href="href"
        target="_blank"
      >{{ text || $t('readDoc') }}</a>
      <span v-else-if="text">{{ text }}</span>
    </slot>
  </v-alert>
</template>

<i18n lang="yaml">
fr:
  readDoc: Consultez la documentation
en:
  readDoc: Read the documentation
</i18n>

<script>
export default {
  props: {
    id: { type: String, required: true },
    href: { type: String, required: false, default: null },
    text: { type: String, required: false, default: null }
  },
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
.tutorial-alert a {
  color: white !important;
  text-decoration: underline;
}
</style>
