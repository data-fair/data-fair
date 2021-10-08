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
        <span>{{ tooltip }}</span>
      </v-tooltip>
    </template>
    <v-card>
      <v-card-text>
        {{ text }}
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          v-t="'no'"
          text
          @click="menu = false"
        />
        <v-btn
          v-t="'yes'"
          :color="yesColor"
          @click="$emit('confirm')"
        />
      </v-card-actions>
    </v-card>
  </v-menu>
</template>

<i18n lang="yaml">
fr:
  yes: Oui
  no: Non
en:
  yes: Yes
  no: No
</i18n>

<script>
  export default {
    props: {
      text: {
        type: String,
        default: 'Souhaitez-vous confirmer cette opération ?',
      },
      tooltip: {
        type: String,
        default: '',
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
