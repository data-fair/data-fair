<template>
  <v-jumbotron src="./images/ThemePark.svg">
    <v-container fill-height>
      <v-layout align-center>
        <v-flex text-xs-center>
          <h3 class="display-3">{{ $t("common.title") }}</h3>
          <span class="subheading">{{ $t("common.description") }}</span>
          <v-divider class="my-3"/>
          <v-btn large flat color="primary" href="https://github.com/koumoul-dev/data-fair">Github</v-btn>
        </v-flex>
      </v-layout>
    </v-container>
  </v-jumbotron>
</template>

<script>
export default {
  layout: 'home'
}
</script>

<style>

.jumbotron__image {
  width: 100%
}
</style>
