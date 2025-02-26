<template>
  <v-dialog
    v-model="dialog"
    max-width="800px"
    @input="toggle"
  >
    <template #activator="{on, attrs}">
      <v-btn
        fab
        small
        depressed
        dark
        v-bind="attrs"
        :color="(expr.trim() || overwritePropertyType) ? 'success' : 'default'"
        :title="$t('transform')"
        v-on="on"
      >
        <v-icon>mdi-database-import</v-icon>
      </v-btn>
    </template>
    <v-card v-if="dialog">
      <v-toolbar
        dense
        flat
      >
        <v-toolbar-title v-t="'transform'" />
        <v-spacer />
        <v-btn
          icon
          @click.native="dialog = false"
        >
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-toolbar>
      <v-card-text class="px-3">
        <tutorial-alert
          id="transform-type"
          persistent
          :initial="true"
          class="mb-2"
        >
          <p>Vous pouvez définir un type de propriété surchargé pour cette colonne. De cette manière vous pouvez définir un type différent de celui détecté automatiquement depuis l'analyse du fichier.</p>
          <p class="mb-0">Si le type choisi ne peut pas être obtenu à partir des données brutes vous pouvez saisir une expression de transformation ci-dessous.</p>
        </tutorial-alert>

        <v-select
          v-model="overwritePropertyType"
          :items="rawPropertyTypes"
          :item-text="item => item.title"
          :item-value="item => `${item.type}${item.format || item['x-display']}`"
          return-object
          label="Surcharger le type"
          outlined
          dense
          persistent-placeholder
          clearable
          :placeholder="'type détecté: ' + detectedPropertyType?.title?.toLowerCase()"
        />

        <tutorial-alert
          id="expr-eval-transform"
          persistent
          :initial="true"
        >
          <p v-html="$t('exprEvalHelp')" />
          <dataset-expr-eval-doc :exclude="['SUM', 'AVERAGE']" />
        </tutorial-alert>

        <v-text-field
          v-model="property['x-transform'].expr"
          class="mt-2"
          :label="$t('expr')"
          outlined
          dense
          :disabled="!editable"
          :error-messages="parsingError"
        />

        <template v-if="editable">
          <v-subheader>{{ $t('examples') }}</v-subheader>
          <v-row
            v-for="(example, i) in property['x-transform'].examples"
            :key="i"
            dense
          >
            <v-col>
              <v-text-field
                v-model="property['x-transform'].examples[i]"
                v-col
                outlined
                dense
                :hide-details="true"
                :disabled="!editable"
              />
            </v-col>
            <v-col>
              <template v-if="!parsingError">
                <v-alert
                  v-if="exampleResults[i].error"
                  type="error"
                  dense
                  text
                  class="mb-0"
                >
                  {{ exampleResults[i].error }}
                </v-alert>
                <v-alert
                  v-else
                  color="success"
                  dense
                  text
                  icon="mdi-arrow-right"
                  class="mb-0"
                  style="max-height: 42px"
                >
                  {{ exampleResults[i].result }}
                </v-alert>
              </template>
            </v-col>
          </v-row>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  transform: Transformation
  expr: Expression
  examples: "Exemples :"
  exprEvalHelp: "Appliquez une transformation aux données de cette colonne quand elles sont chargées.<br><br>
  Une expression (ou formule) est utilisée pour transformer chaque valeur.
  Elle doit suivre la syntaxe du module <a href=\"https://github.com/silentmatt/expr-eval\">expr-eval</a>.
  La valeur à transformer est passée en paramètre avec le nom \"value\". <br><br>
  Quelques fonctions sont disponibles rappelant des fonctionnalités habituelles de tableurs :"
en:
  transform: Transformation
  expr: Expression
  examples: "Examples:"
</i18n>

<script>
import { mapState } from 'vuex'
import exprEval from '../../../../shared/expr-eval'
const { compile } = exprEval(process.env.defaultTimeZone)

export default {
  props: ['editable', 'property'],
  data () {
    return {
      dialog: false,
      parsingError: null,
      parsedExpression: null,
      examples: ['', '', '', '']
    }
  },
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['propertyTypes']),
    rawPropertyTypes () {
      return this.propertyTypes.filter(p => !p['x-display'])
    },
    detectedPropertyType: {
      get () {
        return this.rawPropertyTypes.find(p => p.type === this.property.type && (p.format || null) === (this.property.format || null))
      }
    },
    overwritePropertyType: {
      get () {
        if (!this.property['x-transform']?.type) return null
        return this.rawPropertyTypes.find(p => p.type === this.property['x-transform'].type && (p.format || null) === (this.property['x-transform'].format || null))
      },
      set (propertyType) {
        if (!propertyType) {
          this.$delete(this.property['x-transform'], 'type')
          this.$delete(this.property['x-transform'], 'format')
        } else {
          this.$set(this.property['x-transform'], 'type', propertyType.type)
          if (propertyType.format) {
            this.$set(this.property['x-transform'], 'format', propertyType.format)
          } else {
            this.$delete(this.property['x-transform'], 'format')
          }
        }
      }
    },
    expr () {
      return this.property['x-transform']?.expr || ''
    },
    exampleResults () {
      if (!this.property['x-transform'].examples) return null
      return this.property['x-transform'].examples.map(example => {
        try {
          if (!example) return { result: '' }
          return { result: this.parsedExpression({ value: example }) }
        } catch (err) {
          return { error: err.message }
        }
      })
    }
  },
  watch: {
    expr: {
      handler () {
        this.setExpression()
      },
      immediate: true
    },
    overwritePropertyType () {
      this.setExpression()
    }
  },
  methods: {
    setExpression () {
      if (!this.expr.trim()) {
        this.parsingError = null
      } else {
        const exprProperty = { ...this.property }
        if (this.overwritePropertyType) {
          exprProperty.type = this.overwritePropertyType.type
          if (this.overwritePropertyType.format) {
            exprProperty.format = this.overwritePropertyType.format
          } else {
            delete exprProperty.format
          }
        }
        try {
          this.parsedExpression = compile(this.expr, exprProperty)
          this.parsingError = null
        } catch (err) {
          this.parsingError = err.message
          return null
        }
      }
    },
    toggle (show) {
      if (show) {
        if (!this.property['x-transform']) {
          this.$set(this.property, 'x-transform', {})
        }
        if (!this.property['x-transform'].expr) {
          this.$set(this.property['x-transform'], 'expr', '')
        }
        if (!this.property['x-transform'].examples) {
          this.$set(this.property['x-transform'], 'examples', ['', '', '', '', ''])
        }
      } else {
        if (!this.property['x-transform'].expr && !this.property['x-transform'].type) {
          this.$delete(this.property, 'x-transform')
        }
      }
    }
  }
}
</script>

<style>

</style>
