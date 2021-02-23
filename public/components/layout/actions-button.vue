<template>
  <div class="actions-buttons">
    <v-menu
      bottom
      left
    >
      <template v-slot:activator="{on}">
        <v-btn
          fab
          small
          color="accent"
          v-on="on"
        >
          <v-icon>mdi-dots-vertical</v-icon>
        </v-btn>
      </template>
      <slot name="actions" />
    </v-menu>
  </div>
</template>

<script>
  export default {
  }
</script>

<style lang="css" scoped>
</style>
