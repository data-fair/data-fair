<template>
  <v-card
    :color="selected ? 'primary' : (baseApp.disabled.length ? 'error' : '')"
    :dark="selected || !!baseApp.disabled.length"
    :style="baseApp.disabled.length ? 'cursor:default' : 'cursor:pointer'"
    :elevation="hover && !baseApp.disabled.length ? 2 : 0"
    outlined
    @mouseenter="hover = true"
    @mouseleave="hover = false"
    @click="!baseApp.disabled.length && $emit('click')"
  >
    <v-img
      :src="baseApp.image"
      :alt="baseApp.title"
      aspect-ratio="2.5"
    />
    <v-card-title>
      <h5>
        <v-icon v-if="!baseApp.public" title="baseApp à accès restreint">
          mdi-security
        </v-icon>&nbsp;{{ baseApp.title }}
      </h5>
    </v-card-title>
  </v-card>
</template>

<script>
  export default {
    props: ['baseApp', 'selected'],
    data: () => ({
      hover: false,
    }),
  }
</script>

<style lang="css" scoped>
</style>
