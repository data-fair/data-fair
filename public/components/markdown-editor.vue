<template>
  <v-input
    :value="value"
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
      outlined
    >
      <textarea />
    </v-card>
    <v-card
      v-else
      outlined
    >
      <v-card-text
        class="pb-0"
        v-html="marked(value)"
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

<script>
import 'easymde/dist/easymde.min.css'
import { marked } from 'marked'
const sanitizeHtml = require('../../shared/sanitize-html.js')

export default {
  props: {
    value: { type: String, default: '' },
    label: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    easymdeConfig: { type: Object, default: () => {} },
    required: { type: Boolean, default: false },
    rules: { type: Array, default: () => [] }
  },
  async mounted () {
    if (this.disabled) return
    const EasyMDE = (await import('easymde/src/js/easymde.js')).default

    // cf https://github.com/Ionaru/easy-markdown-editor#configuration
    const config = {
      element: this.$el.querySelector('textarea'),
      theme: 'dark',
      initialValue: this.value,
      renderingConfig: {
        sanitizerFunction: sanitizeHtml
      },
      status: false,
      autoDownloadFontAwesome: false,
      spellChecker: false,
      insertTexts: {
        link: [this.$t('linkBefore'), this.$t('linkAfter')],
        image: [`![](${this.$t('imageHref')}`, ')'],
        table: ['', `\n\n| ${this.$t('column')} 1 | ${this.$t('column')} 2 | ${this.$t('column')} 3 |\n| -------- | -------- | -------- |\n| ${this.$t('text')}     | ${this.$t('text')}     | ${this.$t('text')}     |\n\n`],
        horizontalRule: ['', '\n\n-----\n\n']
      },
      // cf https://github.com/Ionaru/easy-markdown-editor/blob/master/src/js/easymde.js#L1380
      toolbar: [{
        name: 'bold',
        action: EasyMDE.toggleBold,
        // className: 'fa fa-bold',
        className: 'mdi mdi-format-bold',
        title: this.$t('bold')
      }, {
        name: 'italic',
        action: EasyMDE.toggleItalic,
        className: 'mdi mdi-format-italic',
        title: this.$t('italic')
      }, /*, {
                    name: 'heading',
                    action: EasyMDE.toggleHeadingSmaller,
                    className: 'mdi mdi-title',
                    title: 'Heading',
                    default: true,
                  } */ {
        // starting at heading 2.. h1 is reserved to the wrapping page
        name: 'heading-2',
        action: EasyMDE.toggleHeading2,
        className: 'mdi mdi-format-title',
        title: this.$t('heading') + ' 1'
      }, {
        name: 'heading-3',
        action: EasyMDE.toggleHeading3,
        className: 'mdi mdi-format-title',
        title: this.$t('heading') + ' 2'
      },
      '|',
      {
        name: 'quote',
        action: EasyMDE.toggleBlockquote,
        className: 'mdi mdi-format-quote-open',
        title: this.$t('quote')
      },
      {
        name: 'unordered-list',
        action: EasyMDE.toggleUnorderedList,
        className: 'mdi mdi-format-list-bulleted',
        title: this.$t('unorderedList')
      },
      {
        name: 'ordered-list',
        action: EasyMDE.toggleOrderedList,
        className: 'mdi mdi-format-list-numbered',
        title: this.$t('orderedList')
      },
      '|',
      {
        name: 'link',
        action: EasyMDE.drawLink,
        className: 'mdi mdi-link',
        title: this.$t('createLink')
      },
      {
        name: 'image',
        action: EasyMDE.drawImage,
        className: 'mdi mdi-image',
        title: this.$t('insertImage')
      },
      {
        name: 'table',
        action: EasyMDE.drawTable,
        className: 'mdi mdi-table',
        title: this.$t('insertTable')
      },
      '|',
      {
        name: 'preview',
        action: EasyMDE.togglePreview,
        className: 'mdi mdi-eye accent--text',
        title: this.$t('preview'),
        noDisable: true
      },
      /* '|',
                  {
                    name: 'undo',
                    action: EasyMDE.undo,
                    className: 'mdi mdi-undo',
                    title: 'Défaire',
                    noDisable: true,
                  },
                  {
                    name: 'redo',
                    action: EasyMDE.redo,
                    className: 'mdi mdi-redo',
                    title: 'Refaire',
                    noDisable: true,
                  }, */
      '|',
      {
        name: 'guide',
        action: 'https://simplemde.com/markdown-guide',
        className: 'mdi mdi-help-circle success--text',
        title: this.$t('syntaxDoc'),
        noDisable: true
      }
      ],
      ...this.easymdeConfig
    }
    this.easymde = new EasyMDE(config)

    let changed = false
    this.easymde.codemirror.on('change', () => {
      changed = true
      this.$emit('input', this.easymde.value())
    })
    this.easymde.codemirror.on('blur', () => {
      // timeout to prevent triggering save when clicking on a menu button
      this.blurTimeout = setTimeout(() => {
        if (changed) this.$emit('change')
        changed = false
      }, 500)
    })
    this.easymde.codemirror.on('focus', () => {
      clearTimeout(this.blurTimeout)
      this.$emit('focus')
    })
  },
  methods: {
    marked
  }
}
</script>

<style lang="css">
/* lighter style, a v-card is used for the border */
.markdown-editor .v-input__slot {
  display: block;
}
.markdown-editor .EasyMDEContainer .editor-toolbar {
  border: none;
  padding: 2px;
}
.markdown-editor .EasyMDEContainer .CodeMirror {
  border: none;
  background-color: #F0F0F0;
}

/* dark mode, cf https://github.com/Ionaru/easy-markdown-editor/issues/131 */
.markdown-editor.theme--dark .CodeMirror {
  color: white;
  background-color: #303030;
}
.markdown-editor.theme--dark .CodeMirror-cursor {
  border-left-color: white;
  border-right-color: white;
}
.markdown-editor.theme--dark .editor-toolbar > .active, .markdown-editor.theme--dark .editor-toolbar > button:hover, .markdown-editor.theme--dark .editor-preview pre, .markdown-editor.theme--dark .cm-s-easymde .cm-comment {
  background-color: #303030;
}
.markdown-editor.theme--dark .editor-preview {
  background-color: #1E1E1E;
}

/*
editorDark: {

    "& .editor-toolbar > *": {
        color: theme.palette.common.white
    },
    "& .editor-toolbar > .active, .editor-toolbar > button:hover, .editor-preview pre, .cm-s-easymde .cm-comment": {
        backgroundColor: theme.palette.background.paper
    },
    "& .editor-preview": {
        backgroundColor: theme.palette.background.default
    }
}*/
</style>
