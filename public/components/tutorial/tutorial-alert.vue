<template lang="html">
  <div
    style="position: relative;overflow:visible;min-height:22px;"
  >
    <v-alert
      v-model="show"
      :type="$vuetify.breakpoint.smAndUp ? 'info' : null"
      dark
      color="success"
      dense
      border="left"
      class="my-2 tutorial-alert"
      :dismissible="true"
      :outlined="$vuetify.theme.dark"
      :style="'z-index:1;' + ($vuetify.theme.dark ? 'background: black !important' : '')"
      transition="slide-x-reverse-transition"
      @input="close"
    >
      <slot>
        <a
          v-if="href"
          :href="href"
          target="_blank"
        >{{ text || $t('readDoc') }}</a>
        <template v-else>
          <span
            v-if="text"
            v-text="text"
          />
          <div
            v-else-if="html"
            v-html="html"
          />
        </template>
      </slot>
    </v-alert>
    <v-btn
      v-if="!show && persistent"
      icon
      color="success"
      style="position: absolute; top: -8px; right: 0;"
      :title="$t('readHelp')"
      transition="fade-transition"
      @click="show = true"
    >
      <v-icon>
        mdi-information
      </v-icon>
    </v-btn>
  </div>
</template>

<i18n lang="yaml">
fr:
  readHelp: Ouvrez un message d'aide
  readDoc: Consultez la documentation
en:
  readHelp: Open a help message
  readDoc: Read the documentation
</i18n>

<script>
export default {
  props: {
    id: { type: String, required: true },
    href: { type: String, required: false, default: null },
    text: { type: String, required: false, default: null },
    html: { type: String, required: false, default: null },
    initial: { type: Boolean, default: true },
    persistent: { type: Boolean, default: false }
  },
  data: () => ({
    show: false
  }),
  mounted () {
    if (global.localStorage) {
      if (global.localStorage['closed-tutorial-' + this.id] !== 'true') {
        this.show = this.initial
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

<style lang="css">
.tutorial-alert.v-alert .v-alert__content a {
  color: white !important;
  text-decoration: underline;
}
</style>
