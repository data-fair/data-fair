<template>
  <v-layout row>
    <v-navigation-drawer clipped>
      <v-subheader>{{ $t("pages.install.title") }}</v-subheader>
      <v-list>
        <v-list-tile v-for="page in pages" :key="page" :to="localePath({name: 'install-id', params: {id: page}})">
          <v-list-tile-title>{{ $t(`pages.install.${page.replace('-', '')}.title`) }}</v-list-tile-title>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>
    <v-jumbotron height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <h3 class="display-3">{{ $t("pages.install.title") }}</h3>
            <span class="subheading">{{ $t("pages.install.description") }}</span>
          </v-flex>
        </v-layout>
      </v-container>
    </v-jumbotron>
  </v-layout>
</template>

<script>
export default {
  data: () => ({
    pages: ['install', 'config']
  })
}
</script>
