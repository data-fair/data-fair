<template>
  <v-row>
    <span>Supprimer automatiquement les lignes dont la colonne {{ value.prop }} contient une date dépassée de {{ value.delay.value.toLocaleString() }} jours.</span>
  </v-row>
</template>

<script>
  export default {
    props: ['value'],
  }
</script>

<style lang="css" scoped>
</style>
