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

        <v-alert
          dense
          color="admin"
          dark
        >
          <v-select
            v-model="mode"
            label="Mode d'intégration"
            outlined
            dense
            :items="['iframe', 'd-frame']"
            hide-details
          />
        </v-alert>
        <template v-if="mode === 'iframe'">
          <pre>
  &lt;iframe
    src="{{ syncedState.href ? syncedState.href : applicationLink }}"
    width="100%" height="500px" style="background-color: transparent; border: none;"
  /&gt;
            </pre>
          <br>
          Résultat:
          <v-iframe
            :src="applicationLink"
            @state="s => syncedState = s"
          />
        </template>
        <template v-if="mode === 'd-frame'">
          <p v-html="$t('dFrameIntro')" />
          <v-checkbox
            v-if="application.baseApp.meta['df:overflow'] === 'true'"
            v-model="resize"
            :label="$t('resize')"
            hide-details
          />
          <v-checkbox
            v-model="syncParams"
            :label="$t('syncParams')"
          />
          <pre>
  &lt;d-frame
    src="{{ syncedHref || (applicationLink + '?d-frame=true') }}{{ resizeAttr }}{{ syncParamsAttr }}
  /&gt;
            </pre>
          <br>
          Résultat:
          <d-frame
            :src="applicationLink + '?d-frame=true'"
            :resize="resize"
            state-change-events
            @state-change="s => syncedHref = s.detail[1]"
          />
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
  fr:
    integrationMsg: Pour intégrer cette application dans un site vous pouvez copier le code suivant ou un code similaire dans le code source HTML.
    dFrameIntro: <a href="https://data-fair.github.io/frame/latest/">D-Frame</a> est un composant que vous pouvez intégrer à votre site pour une intégration plus riche de l'application.
    resize: Redimensionner automatiquement la hauteur de l'iframe
    syncParams: Synchroniser les paramètres de l'application
  en:
    integrationMsg: To integrate this application in a website you can copy the code below or a similar code in your HTML source code.
    dFrameIntro: <a href="https://data-fair.github.io/frame/latest/">D-Frame</a> is a component that you can integrate in your website for a richer integration of the application.
    resize: Automatically resize the iframe height
    syncParams: Synchronize the application parameters
  </i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import '@data-fair/frame/lib/d-frame.js'

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
    syncedState: {},
    syncedHref: '',
    mode: 'iframe',
    resize: false,
    syncParams: false
  }),
  computed: {
    ...mapState('application', ['application']),
    ...mapGetters('application', ['applicationLink']),
    ...mapState('session', ['user']),
    resizeAttr () {
      return this.resize ? '\n  resize' : (this.application.baseApp.meta['df:overflow'] ? '\n  resize="false"' : '')
    },
    syncParamsAttr () {
      return this.syncParams ? `\n  sync-params="*:${this.application.id}"` : ''
    }
  },
  watch: {
    show () {
      this.syncedState = {}
      this.syncedHref = ''
    }
  }
}
</script>
