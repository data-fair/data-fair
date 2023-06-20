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
        <pre>
  &lt;iframe
    src="{{ syncedState.href ? syncedState.href : previewUrl }}"
    width="100%" height="500px" style="background-color: transparent; border: none;"
  /&gt;&lt;/iframe&gt;
            </pre>
        <br>
        Résultat:
        <v-iframe
          :src="previewUrl"
          @state="s => syncedState = s"
        />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
  fr:
    integrationMsg: Pour intégrer une prévisualisation de ce jeu de données dans un site vous pouvez copier le code suivant ou un code similaire dans le code source HTML.
    previewType: Type de prévisualisation
  en:
    integrationMsg: To integrate a preview of this dataset in a website you can copy the code below or a similar code in your HTML source code.
    previewType: Preview type
  </i18n>

<script>
import { mapState } from 'vuex'
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
    syncedState: {},
    previewId: 'table'
  }),
  computed: {
    ...mapState('dataset', ['dataset']),
    previewUrl () {
      return this.dataset && this.dataset.previews.find(p => p.id === this.previewId).href
    }
  },
  watch: {
    show () {
      this.previewId = 'table'
      this.syncedState = {}
    }
  }
}
</script>
