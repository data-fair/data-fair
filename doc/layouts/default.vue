<template>
  <v-app>
    <v-toolbar
      app
      scroll-off-screen
      color="white"
    >
      <div class="logo-container">
        <nuxt-link
          :title="$t('pages.root.title')"
          :to="localePath('index')"
        >
          <img
            src="../../public/assets/logo.svg"
            style="max-width: 150px;"
          >
        </nuxt-link>
      </div>
      <v-toolbar-title>
        <h1 class="headline">
          DataFair
        </h1>
      </v-toolbar-title>

      <v-spacer />

      <v-toolbar-items>
        <v-btn
          v-for="page in pages"
          :key="page.prefix"
          :to="localePath({name: page.prefix + '-id', params: {id: page.id}})"
          :class="($route.name && $route.name.startsWith(page.prefix)) ? 'v-btn--active' : ''"
          flat
          color="primary"
        >
          {{ $t(`pages.${page.prefix}.title`) }}
        </v-btn>
      </v-toolbar-items>

      <v-spacer />

      <v-speed-dial
        direction="bottom"
        transition="fade-transition"
      >
        <v-btn
          slot="activator"
          fab
          flat
          small
        >
          {{ $i18n.locale }}
        </v-btn>
        <v-btn
          v-for="locale in $i18n.locales.filter(l => l.code !== $i18n.locale)"
          :key="locale.code"
          :to="switchLocalePath(locale.code)"
          fab
          small
          nuxt
        >
          {{ locale.code }}
        </v-btn>
      </v-speed-dial>
    </v-toolbar>

    <v-content>
      <nuxt />
    </v-content>

    <v-footer class="pa-3">
      <v-spacer />
      <div>Powered by <a href="https://koumoul.com">Koumoul</a></div>
    </v-footer>
  </v-app>
</template>

<script>

  export default {
    data: () => ({
      drawer: true,
      pages: [
        { prefix: 'about', id: 'overview' },
        { prefix: 'install', id: 'install' },
        { prefix: 'interoperate', id: 'applications' },
        { prefix: 'user-guide', id: 'introduction' },
      ],
    }),
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
