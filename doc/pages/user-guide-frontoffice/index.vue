<template lang="html">
  <v-container class="index-page">
    <h2 class="text-h4 my-6">
      {{ $t('userGuideFront') }}
      <!--<v-btn :to="localePath({name: 'full-user-guide'})" icon>
        <v-icon color="primary">
          mdi-printer
        </v-icon>
      </v-btn>-->
    </h2>
    <toc
      :context="context"
      name="user-guide-frontoffice"
    />
  </v-container>
</template>

<i18n locale="fr" lang="yaml" src="../../i18n/common-fr.yaml"></i18n>
<i18n locale="en" lang="yaml" src="../../i18n/common-en.yaml"></i18n>

<script>
const context = require.context('./', true, /\.md$/)

export default {
  data: () => ({ context })
}
</script>
