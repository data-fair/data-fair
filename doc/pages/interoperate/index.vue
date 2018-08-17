<template>
  <v-layout row>
    <v-navigation-drawer clipped>
      <v-subheader>{{ $t("pages.interoperate.title") }}</v-subheader>
      <v-list>
        <v-list-tile v-for="page in pages" :key="page" :to="localePath({name: 'interoperate-id', params: {id: page}})">
          <v-list-tile-title>{{ $t(`pages.interoperate.${page.replace('-', '')}.title`) }}</v-list-tile-title>
        </v-list-tile>
      </v-list>
    </v-navigation-drawer>
    <v-jumbotron height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <h3 class="display-3">{{ $t("pages.interoperate.title") }}</h3>
            <span class="subheading">{{ $t("pages.interoperate.description") }}</span>
          </v-flex>
        </v-layout>
      </v-container>
    </v-jumbotron>
  </v-layout>
</template>

<script>
export default {
  data: () => ({
    pages: ['applications', 'services']
  })
}
</script>
