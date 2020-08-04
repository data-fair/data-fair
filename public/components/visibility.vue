<template>
  <v-tooltip top>
    <template v-slot:activator="{on}">
      <v-icon
        :color="visibility === 'public' ? 'primary' : 'accent'"
        v-on="on"
      >
        {{ visibility === 'public' ? 'mdi-lock-open' : 'mdi-lock' }}
      </v-icon>
    </template>
    {{ {public: 'Public', private: 'Privé', protected: 'Protégé'}[visibility] }}
  </v-tooltip>
</template>

<script>
  export default {
    props: ['visibility'],
  }
</script>

<style lang="css" scoped>
</style>
