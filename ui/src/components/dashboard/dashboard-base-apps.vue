<template>
  <v-card
    :loading="!baseApps"
    outlined
    tile
  >
    <v-card-title v-t="$t('baseApps')" />
    <template v-if="baseApps">
      <v-card-text
        v-t="$t('baseAppsCount', {count: baseApps.length})"
        style="min-height:60px"
      />
      <v-hover v-slot="{ hover }">
        <v-carousel
          :cycle="cycle"
          hide-delimiters
          :show-arrows="hover"
          :height="300"
        >
          <v-carousel-item
            v-for="(app, i) in baseApps"
            :key="i"
          >
            <div style="position:relative">
              <v-sheet
                style="position:absolute;top:0;left:0;right:0;z-index:1;"
                flat
                color="rgba(0, 0, 0, 0.8)"
                class="pa-2"
                dark
              >
                {{ app.title }}
              </v-sheet>
              <v-btn
                v-if="hover"
                fab
                style="position:absolute;top:50%;left:50%;z-index:1;transform:translate(-50%,-50%)"
                color="rgba(0, 0, 0, 0.3)"
                dark
                depressed
                small
                @click="cycle = !cycle"
              >
                <v-icon v-if="cycle">mdi-pause</v-icon>
                <v-icon v-else>mdi-play</v-icon>
              </v-btn>
              <v-img
                :src="app.image"
                :height="300"
              />
              <v-sheet
                v-if="app.description"
                style="position:absolute;bottom:0;left:0;right:0;z-index:1;"
                flat
                color="rgba(0, 0, 0, 0.8)"
                class="pa-2"
                dark
              >
                {{ app.description }}
              </v-sheet>
            </div>
          </v-carousel-item>
        </v-carousel>
      </v-hover>
    </template>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  baseApps: Modèles d'application
  baseAppsCount: Vous avez accès à {count} modèles d'application pour créer vos visualisations.
en:
  baseApps: Application models
  baseAppsCount: You have access to {count} application models.

</i18n>

<script>

const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      baseApps: null,
      cycle: true
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  async created () {
    this.baseApps = (await this.$axios.$get('api/v1/base-applications', {
      params: { size: 10000, privateAccess: `${this.activeAccount.type}:${this.activeAccount.id}`, select: 'title,image' }
    })).results
  }
}
</script>

<style lang="css" scoped>
</style>
