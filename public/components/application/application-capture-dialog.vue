<template>
  <v-dialog
    v-model="dialog"
    :max-width="syncState ? 900 : 500"
  >
    <template #activator="{on, attrs}">
      <slot
        name="activator"
        :attrs="attrs"
        :on="on"
      />
    </template>
    <v-card outlined>
      <v-toolbar
        dense
        flat
      >
        <v-toolbar-title v-t="'capture'" />
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text
        v-if="dialog"
        class="pb-0 pt-2"
      >
        <p v-t="'captureMsg'" />
        <v-row dense>
          <v-col>
            <v-text-field
              v-model="width"
              label="Largeur"
              type="number"
              outlined
              dense
              hide-details
            />
          </v-col>
          <v-col>
            <v-text-field
              v-model="height"
              label="Hauteur"
              type="number"
              outlined
              dense
              hide-details
            />
          </v-col>
        </v-row>
        <template v-if="syncState">
          <p
            v-t="'setState'"
            class="mt-2"
          />
          <v-iframe
            :src="applicationLink"
            :sync-state="true"
            :iframe-resizer="false"
            @state="state => {stateSrc = state.href}"
          />
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          :loading="downloading"
          fab
          small
          :title="$t('downloadCapture')"
          @click="download"
        >
          <v-icon>mdi-camera</v-icon>
        </v-btn>
        <v-spacer />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  captureMsg: Une image statique au format PNG va être créée à partir de cette visualisation.
  downloadCapture: télécharger la capture
  setState: naviguez pour choisir l'état de la visualisation dans la capture
en:
  captureMsg: A static image with PNG format will be created based on this visualization.
  downloadCapture: download the screenshot
  setState: navigate to chose the state of the visualization in the screenshot
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import VIframe from '@koumoul/v-iframe'
import fileDownload from 'js-file-download'

export default {
  components: {
    VIframe
  },
  data () {
    return {
      dialog: false,
      width: null,
      height: null,
      stateSrc: null,
      downloading: false
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('application', ['prodBaseApp', 'application']),
    ...mapGetters('application', ['applicationLink']),
    syncState () {
      return this.prodBaseApp.meta && this.prodBaseApp.meta['df:sync-state'] && this.prodBaseApp.meta['df:sync-state'] !== 'false'
    },
    href () {
      const url = new URL(this.application.href + '/capture')
      url.searchParams.set('width', this.width)
      url.searchParams.set('height', this.height)
      url.searchParams.set('updatedAt', this.application.fullUpdatedAt)
      if (this.stateSrc) {
        const stateUrl = new URL(this.stateSrc)
        for (const key of stateUrl.searchParams.keys()) {
          url.searchParams.set('app_' + key, stateUrl.searchParams.get(key))
        }
      }
      return url.href
    }
  },
  watch: {
    dialog () {
      if (this.dialog) {
        this.width = Number((this.prodBaseApp.meta && this.prodBaseApp.meta['df:capture-width']) || 800)
        this.height = Number((this.prodBaseApp.meta && this.prodBaseApp.meta['df:capture-height']) || 450)
      }
    }
  },
  methods: {
    setState (p) {
      console.log('state', p)
    },
    async download () {
      this.downloading = true
      const res = await this.$axios.get(this.href, { responseType: 'blob' })
      fileDownload(res.data, this.application.id + '.' + res.headers['content-type'].split('/').pop())
      this.downloading = false
    }
  }
}
</script>

<style>

</style>
