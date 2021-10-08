<template>
  <v-row>
    <span v-t="{path: 'message', args: {column: value.prop, days: $n(value.delay.value)}}" />
  </v-row>
</template>

<i18n lang="yaml">
fr:
  message: Supprimer automatiquement les lignes dont la colonne {column} contient une date dépassée de {days} jours.
en:
  message: Automatically delete the lines whose column {column} contains a date exceeded by {days} days.
</i18n>

<script>
  export default {
    props: ['value'],
  }
</script>

<style lang="css" scoped>
</style>
