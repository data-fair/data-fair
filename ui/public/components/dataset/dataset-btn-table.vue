<template>
  <v-dialog
    v-model="dialog"
    :fullscreen="$vuetify.breakpoint.smAndDown"
    :max-width="1200"
    transition="none"
  >
    <template #activator="{ on }">
      <v-icon
        :title="$t('preview')"
        :disabled="!dataset.finalizedAt"
        v-on="on"
      >
        mdi-table
      </v-icon>
    </template>
    <v-card
      v-if="dialog"
      outlined
    >
      <v-toolbar
        dense
        flat
        color="transparent"
      >
        <v-toolbar-title class="font-weight-bold">
          {{ dataset.title }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-iframe
        :src="iframeSrc"
        scrolling="yes"
        :iframe-resizer="false"
        :style="$vuetify.breakpoint.smAndDown ? `height: ${windowHeight - 48}px;` : ''"
      />
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  preview: Prévisualiser la donnée
en:
  preview: Preview the data
</i18n>

<script>
import VIframe from '@koumoul/v-iframe'
import { mapState } from 'vuex'

export default {
  components: { VIframe },
  props: ['dataset'],
  data: () => ({
    dialog: false
  }),
  computed: {
    ...mapState(['env']),
    iframeSrc () {
      return `${this.env.publicUrl}/embed/dataset/${this.dataset.id}/table?display=${this.$vuetify.breakpoint.smAndDown ? 'list' : 'table'}`
    }
  }
}
</script>

<style lang="css" scoped>
</style>
