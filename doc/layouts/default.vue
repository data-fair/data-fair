<template>
  <v-app>
    <v-navigation-drawer
      app
      fixed
      width="300"
    >
      <v-list-item
        :to="localePath({name: `index`})"
        nuxt
        exact
      >
        <v-list-item-action>
          <v-img
            src="./logo.svg"
            width="40"
            contain
          />
        </v-list-item-action>
        <v-list-item-content>
          <v-list-item-title class="headline font-weight-bold">
            Data Fair
          </v-list-item-title>
        </v-list-item-content>
      </v-list-item>
      <v-divider />

      <folder-menu />
    </v-navigation-drawer>
    <!-- <v-app-bar
      app
      scroll-off-screen
      color="primary"
      dark
    >

      <div class="logo-container">
        <nuxt-link
          :title="$t('pages.root.title')"
          :to="localePath('index')"
        >
          <img
            src="../../public/assets/logo.svg"
            style="max-width: 150px;max-height: 100%;"
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
          text
        >
          {{ $t(`pages.${page.prefix}.title`) }}
        </v-btn>
      </v-toolbar-items>

      <v-spacer />
    </v-app-bar> -->

    <v-main>
      <v-speed-dial
        direction="bottom"
        transition="fade-transition"
        absolute
        top
        right
      >
        <template v-slot:activator>
          <v-btn icon color="primary">
            {{ $i18n.locale }}
          </v-btn>
        </template>
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
      <nuxt />
    </v-main>

    <v-footer class="pa-3">
      <v-spacer />
      <div>Powered by <a href="https://koumoul.com">Koumoul</a></div>
    </v-footer>
  </v-app>
</template>

<script>
  import FolderMenu from '~/components/FolderMenu'

  export default {
    components: { FolderMenu },
  }

</script>

<style lang="less">
body .v-application {
  font-family: 'Nunito', sans-serif;

  .notification .snack__content {
    height: auto;
    p {
      margin-bottom: 4px;
      margin-top: 4px;
    }
  }
}

</style>
