<template>
  <v-layout row>
    <v-navigation-drawer clipped>
      <v-subheader>{{ $t("pages.about.title") }}</v-subheader>
      <v-list>
        <v-list-tile v-for="page in pages" :key="page" :to="localePath({name: 'about-id', params: {id: page}})">
          <v-list-tile-title>{{ $t(`pages.about.${page.replace('-', '')}.title`) }}</v-list-tile-title>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>
    <v-jumbotron height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <h3 class="display-3">{{ $t("pages.about.title") }}</h3>
            <span class="subheading">{{ $t("pages.about.description") }}</span>
          </v-flex>
        </v-layout>
      </v-container>
    </v-jumbotron>
  </v-layout>
</template>

<script>
export default {
  data: () => ({
    pages: ['overview', 'technical-overview', 'license']
  })
}
</script>
