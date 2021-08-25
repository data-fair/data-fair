<template>
  <v-menu
    offset-y
    tile
    :close-on-content-click="false"
    max-height="500"
  >
    <template v-slot:activator="{ on }">
      <v-btn
        icon
        large
        :color="value.length ? 'warning' : 'default'"
        v-on="on"
      >
        <v-icon>mdi-table-eye</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-subheader>Colonnes visibles</v-subheader>
      <v-card-text class="pt-0">
        <v-btn
          text
          :disabled="!value.length"
          @click="$emit('input', [])"
        >
          tout afficher
        </v-btn>
        <v-checkbox
          v-for="header in headers.filter(h => !!h.field)"
          :key="header.value"
          :value="header.value"
          :label="header.text"
          :input-value="value"
          dense
          hide-details
          @change="newValue => $emit('input', newValue)"
        />
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script>
  export default {
    props: ['value', 'headers'],
  }
</script>

<style lang="css" scoped>
</style>
