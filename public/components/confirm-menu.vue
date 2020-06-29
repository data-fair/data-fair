<template>
  <v-menu v-model="menu">
    <template v-slot:activator="{ on }">
      <v-tooltip top>
        <template v-slot:activator="{ on: onTooltip }">
          <v-btn
            color="warning"
            icon
            v-on="{...onTooltip, ...on}"
          >
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </template>
        <span>Supprimer l'extension</span>
      </v-tooltip>
    </template>
    <v-card>
      <v-card-text>
        {{ text }}
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn text @click="menu = false">
          Non
        </v-btn>
        <v-btn :color="yesColor" @click="$emit('confirm')">
          Oui
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<script>
  export default {
    props: {
      text: {
        type: String,
        default: 'Souhaitez-vous confirmer cette opération ?',
      },
      yesColor: {
        type: String,
        default: 'primary',
      },
    },
    data() {
      return { menu: false }
    },
  }
</script>

<style lang="css" scoped>
</style>
