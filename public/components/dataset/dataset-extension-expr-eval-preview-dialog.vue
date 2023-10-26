<template>
  <v-dialog
    v-model="dialog"
    :fullscreen="true"
  >
    <template #activator="{ on }">
      <v-tooltip top>
        <template #activator="{ on: onTooltip }">
          <v-btn
            color="primary"
            icon
            :disabled="disabled"
            v-on="{...onTooltip, ...on}"
          >
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
        </template>
        <span v-t="'preview'" />
      </v-tooltip>
    </template>

    <v-card outlined>
      <v-toolbar
        dense
        flat
      >
        {{ $t('preview') }}&nbsp;{{ extension.property?.['x-originalName'] || $t('newExprEval') }}
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text>
        <lazy-dataset-extension-expr-eval-preview
          v-if="dialog"
          :extension="extension"
        />
      </v-card-text>
      <v-divider />
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  preview: Prévisualisation
  newExprEval: nouvelle colonne calculée
en:
  preview: Preview
  newExprEval: new calculated column
</i18n>

<script>
export default {
  props: ['extension', 'disabled'],
  data () {
    return {
      dialog: false
    }
  }
}
</script>

<style lang="css" scoped>
</style>
