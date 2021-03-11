<template>
  <v-form>
    <v-text-field v-model="reuse.title" label="Libellé" />
    <v-textarea
      v-model="reuse.description"
      label="Description"
      rows="3"
    />
    <v-select v-model="reuse.type" :items="[{text: 'Lien de navigation', value:'link'}, {text: 'Intégration IFrame', value:'embed'}]" />
    <v-text-field v-model="reuse.link" label="Lien" />
    <template v-if="reuse.type === 'embed'">
      <v-checkbox v-model="reuse.fixedHeight" label="Hauteur fixe" />
      <v-text-field
        v-if="reuse.fixedHeight"
        v-model.number="reuse.height"
        label="Hauteur (en pixels)"
      />
      <p v-else>
        Pour un bon rendu, il faut que la page intégrée utilise la librairie <a href="https://github.com/davidjbradshaw/iframe-resizer" target="_blank">iFrame Resizer</a>
      </p>
    </template>
  </v-form>
</template>

<script>
  export default {
    props: ['reuse'],
  }
</script>

<style lang="css" scoped>
</style>
