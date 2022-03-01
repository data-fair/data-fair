<template>
  <v-menu
    v-model="menu"
    max-width="500"
    left
  >
    <template #activator="{ on, attrs }">
      <v-btn
        v-bind="{...attrs, ...btnProps}"
        :title="tooltip"
        v-on="on"
      >
        <v-icon>mdi-delete</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-card-title
        v-if="title"
        primary-title
      >
        {{ title }}
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="alert"
          :type="alert"
          outlined
        >
          {{ text }}
        </v-alert>
        <template v-else>
          {{ text }}
        </template>
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
    title: {
      type: String,
      default: ''
    },
    text: {
      type: String,
      default: 'Souhaitez-vous confirmer cette opération ?'
    },
    tooltip: {
      type: String,
      default: ''
    },
    yesColor: {
      type: String,
      default: 'primary'
    },
    btnProps: {
      type: Object,
      default: () => ({ color: 'warning', icon: true })
    },
    alert: {
      type: String,
      default: ''
    }
  },
  data () {
    return { menu: false }
  }
}
</script>

<style lang="css" scoped>
</style>
