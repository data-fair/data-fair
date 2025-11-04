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
        <v-select
          v-if="dataset.previews && dataset.previews.length > 1"
          v-model="previewId"
          :items="dataset.previews"
          :label="$t('previewType')"
          item-text="title"
          item-value="id"
          style="max-width: 200px;"
          hide-details
        />
        <br>
        <template v-if="mode === 'iframe'">
          <pre>
  &lt;iframe
    src="{{ syncedState.href ? syncedState.href : previewUrl }}"
    width="100%" height="500px" style="background-color: transparent; border: none;"
  /&gt;&lt;/iframe&gt;
            </pre>
        </template>
        <template v-if="mode === 'd-frame'">
          <p v-html="$t('dFrameIntro')" />
          <v-checkbox
            v-model="syncParams"
            :label="$t('syncParams')"
          />
          <pre>
  &lt;d-frame
    height="500px"
    scrolling="no"
    resize="no"
    src="{{ syncedHref || (previewUrl + '?d-frame=true') }}{{ syncParamsAttr }}
  /&gt;
            </pre>
        </template>
        Résultat:
        <div
          style="height:500px;"
          class="mb-4"
        >
          <d-frame
            v-if="togglePreview"
            :src="previewUrl + '?d-frame=true'"
            state-change-events
            height="500px"
            scrolling="no"
            resize="no"
            debug
            @state-change="s => syncedHref = s.detail[1]"
          />
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
  fr:
    integrationMsg: Pour intégrer une prévisualisation de ce jeu de données dans un site vous pouvez copier le code suivant ou un code similaire dans le code source HTML.
    previewType: Type de prévisualisation
    dFrameIntro: <a href="https://data-fair.github.io/frame/latest/">D-Frame</a> est un composant que vous pouvez intégrer à votre site pour une intégration plus riche de la prévisualisation de données.
    syncParams: Synchroniser les paramètres de l'application
  en:
    integrationMsg: To integrate a preview of this dataset in a website you can copy the code below or a similar code in your HTML source code.
    previewType: Preview type
    dFrameIntro: <a href="https://data-fair.github.io/frame/latest/">D-Frame</a> is a component that you can integrate in your website for a richer integration of data previsualization.
    syncParams: Synchronize the application parameters
  </i18n>

<script>
import { mapState } from 'vuex'
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
    previewId: 'table',
    mode: 'iframe',
    syncParams: false,
    togglePreview: true
  }),
  computed: {
    ...mapState('dataset', ['dataset']),
    previewUrl () {
      return this.dataset && this.dataset.previews.find(p => p.id === this.previewId).href
    },
    syncParamsAttr () {
      return this.syncParams ? `\n  sync-params="*:${this.dataset.id}"` : ''
    }
  },
  watch: {
    show () {
      this.previewId = 'table'
      this.syncedState = {}
      this.syncedHref = ''
    },
    previewUrl () {
      this.togglePreview = false
      setTimeout(resolve => {
        this.togglePreview = true
      }, 0)
    }
  }
}
</script>
