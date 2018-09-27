<template>
  <v-app>
    <v-toolbar app scroll-off-screen color="white">
      <div class="logo-container">
        <nuxt-link :title="$t('pages.root.title')" :to="localePath('index')">
          <img src="../../public/assets/logo.svg" style="max-width: 150px;">
        </nuxt-link>
      </div>
      <v-toolbar-title><h1 class="headline">DataFair</h1></v-toolbar-title>

      <v-spacer/>

      <v-toolbar-items>
        <v-btn v-for="page in pages" :key="page" :to="localePath({name: page})" :class="routePrefix === page ? 'v-btn--active' : ''" flat color="primary">{{ $t(`pages.${page.replace('-', '')}.title`) }}</v-btn>
      </v-toolbar-items>

      <v-spacer/>

      <v-speed-dial
        direction="bottom"
        transition="fade-transition"
      >
        <v-btn slot="activator" fab flat small>{{ $i18n.locale }}</v-btn>
        <v-btn v-for="locale in $i18n.locales.filter(l => l.code !== $i18n.locale)" :key="locale.code" :to="switchLocalePath(locale.code)" fab small nuxt>
          {{ locale.code }}
        </v-btn>
      </v-speed-dial>

    </v-toolbar>
    <v-content>
      <v-container fluid>
        <nuxt/>
      </v-container>
    </v-content>
    <v-footer class="pa-3">
      <v-spacer/>
      <div>Powered by <a href="https://koumoul.com">Koumoul</a></div>
    </v-footer>
  </v-app>
</template>

<script>

export default {
  data: () => ({
    drawer: true,
    pages: ['about', 'install', 'interoperate', 'user-guide']
  }),
  computed: {
    routePrefix() {
      return this.$route && this.$route.name && this.$route.name.split('-')[0]
    }
  }
}

</script>

<style lang="less">
body .application {
  font-family: 'Nunito', sans-serif;

  .logo-container {
    height: 100%;
    padding: 4px;
    margin-left: 4px !important;
    margin-right: 4px;

    img, svg {
      height:100%;
    }
  }

  .notification .snack__content {
    height: auto;
    p {
      margin-bottom: 4px;
      margin-top: 4px;
    }
  }
}

</style>
