<template>
  <div class="actions-buttons">
    <v-menu
      bottom
      left
      :close-on-content-click="false"
    >
      <template v-slot:activator="{on}">
        <v-btn
          fab
          small
          color="accent"
          v-on="on"
        >
          <v-icon v-text="icon" />
        </v-btn>
      </template>
      <slot name="actions" />
    </v-menu>
  </div>
</template>

<script>
  export default {
    props: {
      icon: { type: String, default: 'mdi-dots-vertical' },
    },
  }
</script>

<style lang="css" scoped>
</style>
