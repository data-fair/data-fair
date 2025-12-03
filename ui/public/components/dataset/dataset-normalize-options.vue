<template>
  <div>
    <v-text-field
      v-model.number="value.spreadsheetWorksheetIndex"
      name="spreadsheetWorksheetIndex"
      label="numéro de la feuille"
      outlined
      dense
      clearable
      persistent-hint
      placeholder="1"
      type="number"
      style="max-width: 500px"
    />
    <v-text-field
      v-model.number="value.spreadsheetIgnoredStartingRows"
      name="spreadsheetIgnoredStartingRows"
      label="nombre de lignes à ignorer en haut de la feuille"
      outlined
      dense
      clearable
      persistent-hint
      placeholder="0"
      type="number"
      style="max-width: 500px"
    />
    <v-text-field
      v-model.number="value.spreadsheetIgnoredStartingCols"
      name="spreadsheetIgnoredStartingCols"
      label="nombre de colonnes à ignorer à gauche de la feuille"
      outlined
      dense
      clearable
      persistent-hint
      placeholder="0"
      type="number"
      style="max-width: 500px"
    />
  </div>
</template>

<script>
export default {
  props: {
    value: { type: Object, required: true }
  },
  watch: {
    value: {
      handler () {
        for (const key of Object.keys(this.value)) {
          if (this.value[key] === '' || this.value[key] === null) this.$delete(this.value, key)
        }
      },
      deep: true
    }
  }
}
</script>

<style lang="css" scoped>
</style>
