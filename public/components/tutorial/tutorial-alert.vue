<template lang="html">
  <div
    class="tutorial-alert py-2 pr-2"
  >
    <v-alert
      :value="show"
      dark
      color="success"
      dense
      border="left"
      class="ma-0"
      :outlined="$vuetify.theme.dark"
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
      v-if="show || (!show && persistent)"
      class="toggle"
      icon
      color="success"
      :title="show ? $t('closeHelp') : $t('readHelp')"
      @click="show = !show"
    >
      <v-icon v-if="show">
        mdi-close-circle
      </v-icon>
      <v-icon v-else>
        mdi-information
      </v-icon>
    </v-btn>
  </div>
</template>

<i18n lang="yaml">
fr:
  readHelp: Ouvrez un message d'aide
  closeHelp: Fermez le message d'aide
  readDoc: Consultez la documentation
en:
  readHelp: Open a help message
  closeHelp: Close the help message
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
  watch: {
    show () {
      if (!this.show) global.localStorage['closed-tutorial-' + this.id] = 'true'
    }
  },
  mounted () {
    if (global.localStorage) {
      if (global.localStorage['closed-tutorial-' + this.id] !== 'true') {
        this.show = this.initial
      }
    }
  }
}
</script>

<style lang="css">
.tutorial-alert {
  /*background-color: rgba(10, 10, 10, 0.1);*/
  position: relative;
  overflow:visible;
  min-height:20px;
}
.tutorial-alert .v-alert--outlined {
  background: black !important
}
.tutorial-alert .v-alert .v-alert__content a {
  color: white !important;
  text-decoration: underline;
}
.tutorial-alert .v-alert .v-alert__dismissible {
  position: absolute;
  top: 8px;
  right: 8px;
}
.tutorial-alert .toggle.v-btn {
  position: absolute;
  top: -8px;
  right: -8px;
}
.tutorial-alert .toggle.v-btn .v-icon {
  border-radius: 30px;
}
.tutorial-alert .toggle.v-btn .v-icon.theme--dark {
  background-color: black;
}
.tutorial-alert .toggle.v-btn .v-icon.theme--light {
  background-color: white;
}
</style>
