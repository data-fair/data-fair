<template>
  <v-form>
    <v-text-field
      v-model="reuse.title"
      :label="$t('title')"
    />
    <v-textarea
      v-model="reuse.description"
      :label="$t('description')"
      rows="3"
    />
    <v-select
      v-model="reuse.type"
      :items="[{text: $t('link'), value:'link'}, {text: $t('iframe'), value:'embed'}]"
    />
    <v-text-field
      v-model="reuse.link"
      :label="$t('url')"
    />
    <template v-if="reuse.type === 'embed'">
      <v-checkbox
        v-model="reuse.fixedHeight"
        :label="$t('fixedHeight')"
      />
      <v-text-field
        v-if="reuse.fixedHeight"
        v-model.number="reuse.height"
        :label="$t('height')"
      />
      <p
        v-else
        v-html="$t('resizerMessage')"
      />
    </template>
  </v-form>
</template>

<i18n lang="yaml">
fr:
  title: Libellé
  description: Description
  link: Lien de navigation
  iframe: Intégration IFrame
  url: Lien
  height: Hauteur (en pixels)
  fixedHeight: Hauteur fixe
  resizerMessage: Pour un rendu avec une hauteur adaptable, il faut que la page intégrée utilise la librairie <a href="https://github.com/davidjbradshaw/iframe-resizer" target="_blank">iFrame Resizer</a>
en:
  title: Title
  description: Description
  link: Navigation link
  iframe: IFrame integration
  url: Link
  height: Height (in pixels)
  fixedHeight: Fixed height
  resizerMessage: For a rendering with a adaptable heigth, the included page must use the library <a href="https://github.com/davidjbradshaw/iframe-resizer" target="_blank">iFrame Resizer</a>
</i18n>

<script>
export default {
  props: ['reuse']
}
</script>

<style lang="css" scoped>
</style>
