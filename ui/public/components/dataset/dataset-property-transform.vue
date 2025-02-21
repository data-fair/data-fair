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
        :color="expr.trim() ? 'success' : 'default'"
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
                  style="max-height: 42px"
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
  emptyExpr: Saisissez une expression
  examples: "Exemples :"
  exprEvalHelp: "Appliquez une transformation aux données de cette colonne quand elles sont chargées.<br><br>
  Une expression (ou formule) est utilisée pour transformer chaque valeur.
  Elle doit suivre la syntaxe du module <a href=\"https://github.com/silentmatt/expr-eval\">expr-eval</a>.
  La valeur à transformer est passée en paramètre avec le nom \"value\". <br><br>
  Quelques fonctions sont disponibles rappelant des fonctionnalités habituelles de tableurs :"
en:
  transform: Transformation
  expr: Expression
  emptyExpr: Write an expression
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
    expr () {
      return this.property['x-transform'].expr || ''
    },
    exampleResults () {
      if (!this.property['x-transform'].examples) return null
      return this.property['x-transform'].examples.map(example => {
        try {
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
        if (!this.expr.trim()) {
          this.parsingError = this.$t('emptyExpr')
        } else {
          try {
            this.parsedExpression = compile(this.expr, this.property)
            this.parsingError = null
          } catch (err) {
            this.parsingError = err.message
            return null
          }
        }
      },
      immediate: true
    }
  },
  methods: {
    toggle (show) {
      if (show) {
        if (!this.property['x-transform']) {
          this.$set(this.property, 'x-transform', { expr: '' })
        }
        if (!this.property['x-transform'].examples) {
          this.$set(this.property['x-transform'], 'examples', ['', '', '', '', ''])
        }
      } else {
        if (!this.property['x-transform'].expr) {
          this.$delete(this.property, 'x-transform')
        }
      }
    }
  }
}
</script>

<style>

</style>
