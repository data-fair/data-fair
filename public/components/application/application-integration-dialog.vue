<template>
  <v-dialog
    v-model="show"
    max-width="1200"
  >
    <v-card outlined>
      <v-toolbar
        dense
        flat
      >
        <v-toolbar-title>{{ title }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click.native="$emit('hide')"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text
        v-if="show"
        class="pb-0 px-4"
      >
        {{ $t('integrationMsg') }}
        <br>
        <pre>
  &lt;iframe
    src="{{ syncedState.href ? syncedState.href : (applicationLink + '?embed=true') }}"
    width="100%" height="500px" style="background-color: transparent; border: none;"
  /&gt;&lt;/iframe&gt;
            </pre>
        <br>
        Résultat:
        <v-iframe
          :src="applicationLink"
          @state="s => syncedState = s"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
  fr:
    integrationMsg: Pour intégrer cette application dans un site vous pouvez copier le code suivant ou un code similaire dans le code source HTML.
  en:
    integrationMsg: To integrate this application in a website you can copy the code below or a similar code in your HTML source code.
  </i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'

export default {
  components: { VIframe },
  props: {
    show: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      required: true
    }
  },
  data: () => ({
    syncedState: {}
  }),
  computed: {
    ...mapState('application', ['application']),
    ...mapGetters('application', ['applicationLink'])
  },
  watch: {
    show () {
      this.syncedState = {}
    }
  }
}
</script>
