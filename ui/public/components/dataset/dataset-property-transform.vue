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
          :html="$t('exprEvalHelp')"
          persistent
          :initial="true"
        />

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
  Quelques fonctions sont disponibles rappelant des fonctionnalités habituelles de tableurs :
  <ul>
    <li><code>CONCATENATE ou CONCAT(param1, param2, ...)</code><br>retourne une chaîne de caractère résultat de la concaténation de tous les paramètres. Les paramètres qui ne sont pas des chaînes de caractères seront ignorés.</li>
    <li><code>TRIM(param)</code><br>enlève les caractères blancs au début et à la fin de la chaine de caractère en paramètre et remplace toutes les séries de caractères blancs dans le contenu par un simple espace.</li>
    <li><code>UPPER(param)</code><br>passe une chaîne de caractère en majuscule.</li>
    <li><code>LOWER(param)</code><br>passe une chaîne de caractère en minuscule.</li>
    <li><code>SUBSTRING(param, debut, longueur)</code><br>extrait une sous chaîne de caractère en spécifiant la position de début (commence à 0) et la longueur (la longueur est un paramètre optionnel).</li>
    <li><code>EXTRACT(param, avant, après)</code><br>extrait une sous chaîne de caractère en spécifiant une chaîne à trouver avant et une autre après. Si un séparateur avant ou après est vide il est ignoré. Si un séparateur avant ou après n'est pas trouvé le résultat est vide.</li>
    <li><code>REPLACE(param, recherche, remplacement)</code><br>remplace toutes les occurrences d'une sous chaîne de caractère par une autre.</li>
    <li><code>STRPOS(param, recherche)</code><br>retourne la position de la première occurrence d'une sous chaîne de caractère.</li>
    <li><code>SUM(param1, param2, ...)</code><br>effectue la somme de tous les paramètres. Les paramètres vides ou qui ne sont pas des nombres seront ignorés.</li>
    <li><code>AVERAGE ou AVG(param1, param2, ...)</code><br>calcule la moyenne de tous les paramètres. Les paramètres vides ou qui ne sont pas des nombres seront ignorés.</li>
    <li><code>SPLIT(param, séparateur)</code><br>utilise le séparateur pour diviser la chaîne de caractères en paramètre et retourne un tableau.</li>
    <li><code>JOIN(tableau, séparateur)</code><br>retourne une chaîne de caractère résultat de la concaténation des éléments du tableau en insérant le séparateur entre chaque élément. Le séparateur par défaut est \",\".</li>
    <li><code>MD5(param1, param2, ...)</code><br>calcule une signature MD5 de la liste des paramètres.</li>
    <li><code>TRANSFORM_DATE(date, format entrée, format sortie, fuseau horaire entrée, fuseau horaire sortie)</code><br>Transforme une date d'un format à un autre. La liste des formats est disponible sur la documentation de <a href=\"https://day.js.org/docs/en/display/format\">dayjs</a>. Si un format d'entrée ou de sortie est laissé vide c'est un format standard ISO 8601 complet qui est utilisé. \"X\" est un format spécial pour un timestamp Unix et \"x\" pour un timestamp Unix en millisecondes. Les paramètres de fuseaux horaires sont optionnels et valent \"Europe/Paris\" par défaut.</li>
    <li><code>DEFINED(param)</code><br>Retourne vrai si le paramètre est défini.</li>
    <li><code>TRUTHY(param)</code><br>Retourne vrai si le paramètre est défini et ne vaut pas false, 0 ou chaîne vide.</li>
  </ul>"
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
