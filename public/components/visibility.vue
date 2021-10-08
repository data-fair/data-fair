<template>
  <v-tooltip top>
    <template v-slot:activator="{on}">
      <v-icon
        :color="visibility === 'public' ? 'primary' : 'accent'"
        :small="small"
        v-on="on"
      >
        {{ visibility === 'public' ? 'mdi-lock-open' : 'mdi-lock' }}
      </v-icon>
    </template>
    {{ $t(visibility) }}
  </v-tooltip>
</template>

<i18n lang="yaml">
fr:
  public: Public
  private: Privé
  protected: Protégé
en:
  public: Public
  private: Private
  protected: Protected
</i18n>

<script>
  export default {
    props: ['visibility', 'small'],
  }
</script>

<style lang="css" scoped>
</style>
