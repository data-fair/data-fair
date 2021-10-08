<template>
  <v-responsive height="auto">
    <v-container class="fill-height">
      <v-row align="center">
        <v-col class="text-center">
          <div v-t="'noAuthorized'" class="text-h6" />
        </v-col>
      </v-row>
    </v-container>
  </v-responsive>
</template>

<i18n lang="yaml">
fr:
  notAuthorized: Vous n'êtes pas autorisé à voir le contenu de cette page. Si vous avez besoin de connaitres ces informations, veuillez contacter un administrateur de celle ci.
en:
  notAuthorized: You are not authorized to see the content of this page. If you need to access this data please contact its administrator.
</i18n>

<script>
  export default { }
</script>

<style lang="css" scoped>
</style>
