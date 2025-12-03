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
      v-model.number="value.spreadsheetHeaderLine"
      name="spreadsheetHeaderLine"
      label="numéro de ligne de l'entête"
      outlined
      dense
      clearable
      persistent-hint
      placeholder="1"
      type="number"
      style="max-width: 500px"
    />
    <v-text-field
      v-model.number="value.spreadsheetStartCol"
      name="spreadsheetStartCol"
      label="numéro de la 1ère colonne de données"
      outlined
      dense
      clearable
      persistent-hint
      placeholder="1"
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
