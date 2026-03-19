<!-- eslint-disable vue/no-v-html, vue/no-v-text-v-html-on-component -->
<template>
  <v-input
    :model-value="modelValue"
    :label="label"
    :disabled="disabled"
    class="markdown-editor"
    :rules="rules"
    :required="required"
  >
    <template #append>
      <slot name="append" />
    </template>
    <v-card
      v-if="!disabled"
      variant="outlined"
      width="100%"
    >
      <textarea ref="textareaRef" />
    </v-card>
    <v-card
      v-else
      variant="outlined"
      width="100%"
    >
      <v-card-text
        class="pb-0"
        v-html="renderedHtml"
      />
    </v-card>
  </v-input>
</template>

<i18n lang="yaml">
fr:
  linkBefore: "[titre du lien"
  linkAfter: "](adresse du lien)"
  imageHref: adresse de l'image
  column: Colonne
  text: Texte
  bold: Gras
  italic: Italique
  heading: Titre
  quote: Citation
  unorderedList: Liste à puce
  orderedList: Liste numérotée
  createLink: Créer un lien
  insertImage: Insérer une image
  insertTable: Insérer un tableau
  preview: Aperçu du rendu
  syntaxDoc: Documentation de la syntaxe
en:
  linkBefore: "[link title"
  linkAfter: "](link url)"
  imageHref: image url
  column: Column
  text: Text
  bold: Bold
  italic: Italic
  heading: Heading
  quote: Quote
  unorderedList: Unordered list
  orderedList: Ordered list
  createLink: Create a link
  insertImage: Insert an image
  insertTable: Insert a table
  preview: Preview
  syntaxDoc: Syntax documentation
</i18n>

<script lang="ts" setup>
import { marked } from 'marked'
import sanitizeHtml from '#shared/sanitize-html.js'

const props = withDefaults(defineProps<{
  modelValue?: string
  label?: string
  disabled?: boolean
  required?: boolean
  rules?: any[]
}>(), {
  modelValue: '',
  label: '',
  disabled: false,
  required: false,
  rules: () => []
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { t } = useI18n()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
let easymde: any = null
let blurTimeout: ReturnType<typeof setTimeout> | null = null

const renderedHtml = computed(() => {
  if (!props.modelValue) return ''
  const html = marked(props.modelValue) as string
  return sanitizeHtml(html)
})

onMounted(async () => {
  if (props.disabled || !textareaRef.value) return

  await import('easymde/dist/easymde.min.css')
  const EasyMDE = (await import('easymde')).default

  easymde = new EasyMDE({
    element: textareaRef.value,
    initialValue: props.modelValue,
    renderingConfig: {
      sanitizerFunction: sanitizeHtml
    },
    status: false,
    autoDownloadFontAwesome: false,
    spellChecker: false,
    insertTexts: {
      link: [t('linkBefore'), t('linkAfter')],
      image: [`![](${t('imageHref')}`, ')'],
      table: ['', `\n\n| ${t('column')} 1 | ${t('column')} 2 | ${t('column')} 3 |\n| -------- | -------- | -------- |\n| ${t('text')}     | ${t('text')}     | ${t('text')}     |\n\n`],
      horizontalRule: ['', '\n\n-----\n\n']
    },
    toolbar: [
      { name: 'bold', action: EasyMDE.toggleBold, className: 'mdi mdi-format-bold', title: t('bold') },
      { name: 'italic', action: EasyMDE.toggleItalic, className: 'mdi mdi-format-italic', title: t('italic') },
      { name: 'heading-2', action: EasyMDE.toggleHeading2, className: 'mdi mdi-format-title', title: t('heading') + ' 1' },
      { name: 'heading-3', action: EasyMDE.toggleHeading3, className: 'mdi mdi-format-title', title: t('heading') + ' 2' },
      '|',
      { name: 'quote', action: EasyMDE.toggleBlockquote, className: 'mdi mdi-format-quote-open', title: t('quote') },
      { name: 'unordered-list', action: EasyMDE.toggleUnorderedList, className: 'mdi mdi-format-list-bulleted', title: t('unorderedList') },
      { name: 'ordered-list', action: EasyMDE.toggleOrderedList, className: 'mdi mdi-format-list-numbered', title: t('orderedList') },
      '|',
      { name: 'link', action: EasyMDE.drawLink, className: 'mdi mdi-link', title: t('createLink') },
      { name: 'image', action: EasyMDE.drawImage, className: 'mdi mdi-image', title: t('insertImage') },
      { name: 'table', action: EasyMDE.drawTable, className: 'mdi mdi-table', title: t('insertTable') },
      '|',
      { name: 'preview', action: EasyMDE.togglePreview, className: 'mdi mdi-eye', title: t('preview'), noDisable: true },
      '|',
      { name: 'guide', action: 'https://simplemde.com/markdown-guide', className: 'mdi mdi-help-circle', title: t('syntaxDoc'), noDisable: true }
    ]
  })

  easymde.codemirror.on('change', () => {
    emit('update:modelValue', easymde.value())
  })
  easymde.codemirror.on('blur', () => {
    blurTimeout = setTimeout(() => {
      // timeout to prevent triggering actions when clicking on a menu button
    }, 500)
  })
  easymde.codemirror.on('focus', () => {
    if (blurTimeout) clearTimeout(blurTimeout)
  })
})

onBeforeUnmount(() => {
  if (easymde) {
    easymde.toTextArea()
    easymde = null
  }
  if (blurTimeout) clearTimeout(blurTimeout)
})
</script>

<style>
.markdown-editor .v-input__control {
  display: block;
}
.markdown-editor .EasyMDEContainer .editor-toolbar {
  border: none;
  padding: 2px;
}
.markdown-editor .EasyMDEContainer .CodeMirror {
  border: none;
}
</style>
