<template>
  <ul>
    <li
      v-for="fn in functionsArray"
      :key="fn.key"
      class="mb-2"
    >
      <code>{{ fn.key }}({{ fn.params }})</code>
      <p
        class="mb-0"
        v-html="fn.description"
      />
      <ul style="list-style-type:none;">
        <li
          v-for="example in fn.examples"
          :key="example[0]"
          class="text-caption"
        >
          <code>{{ example[0] }} => {{ example[1] }}</code>
        </li>
      </ul>
    </li>
  </ul>
</template>

<script>
export default {
  props: ['exclude'],
  data () {
    return {
      functions: {
        CONCATENATE: {
          description: 'retourne une chaîne de caractère résultat de la concaténation de tous les paramètres. Les paramètres qui ne sont pas des chaînes de caractères seront ignorés.',
          params: 'param1, param2, ...',
          examples: [
            ['CONCATENATE("Hello", " ", "world")', 'Hello world'],
          ]
        },
        TRIM: {
          description: 'enlève les caractères blancs au début et à la fin de la chaine de caractère en paramètre et remplace toutes les séries de caractères blancs dans le contenu par un simple espace.',
          params: 'param',
          examples: [
            ['TRIM("  Hello  world  ")', 'Hello world'],
          ]
        },
        UPPER: {
          description: 'passe une chaîne de caractère en majuscule.',
          params: 'param',
          examples: [
            ['UPPER("Hello world")', 'HELLO WORLD'],
          ]
        },
        LOWER: {
          description: 'passe une chaîne de caractère en minuscule.',
          params: 'param',
          examples: [
            ['LOWER("Hello world")', 'hello world'],
          ]
        },
        TITLE: {
          description: 'passe une chaîne de caractère en titre (chaque mot commence par une majuscule).',
          params: 'param',
          examples: [
            ['TITLE("hello world")', 'Hello World'],
          ]
        },
        PHRASE: {
          description: 'passe une chaîne de caractère en phrase (la première lettre est en majuscule et le reste en minuscule).',
          params: 'param',
          examples: [
            ['PHRASE("HELLO WORLD")', 'Hello world'],
          ]
        },
        SLUG: {
          description: 'passe une chaîne de caractère en slug (sans caractères spéciaux, sans majuscules, sans espaces).',
          params: 'param',
          examples: [
            ['SLUG("Hello world")', 'hello-world'],
          ]
        },
        PAD_RIGHT: {
          description: 'ajoute des caractères à droite de la chaîne de caractère pour atteindre une longueur donnée.',
          params: 'param, longueur, caractère',
          examples: [
            ['PAD_RIGHT("Hello", 10, " ")', 'Hello     '],
          ]
        },
        PAD_LEFT: {
          description: 'ajoute des caractères à gauche de la chaîne de caractère pour atteindre une longueur donnée.',
          params: 'param, longueur, caractère',
          examples: [
            ['PAD_LEFT("Hello", 10, " ")', '     Hello'],
          ]
        },
        JSON_PARSE: {
          description: 'parse une chaîne de caractère JSON.',
          params: 'param',
          examples: [
            ['JSON_PARSE(\'["hello", "world"]\')', ['hello', 'world']],
          ]
        },
        GET: {
          description: 'retourne la valeur d\'une propriété d\'un objet.',
          params: 'param, propriété, défaut',
          examples: [
            ['GET(JSON_PARSE("{\\"hello\\": \\"world\\"}"), "hello")', 'world'],
            ['GET(JSON_PARSE("{}"), "hello", "world")', 'world'],
          ]
        },
        SUBSTRING: {
          description: 'extrait une sous chaîne de caractère en spécifiant la position de début (commence à 0) et la longueur (la longueur est un paramètre optionnel).',
          params: 'param, debut, longueur',
          examples: [
            ['SUBSTRING("Hello world", 6, 5)', 'world'],
          ]
        },
        EXTRACT: {
          description: 'extrait une sous chaîne de caractère en spécifiant une chaîne à trouver avant et une autre après. Si un séparateur avant ou après est vide il est ignoré. Si un séparateur avant ou après n\'est pas trouvé le résultat est vide.',
          params: 'param, avant, après',
          examples: [
            ['EXTRACT("Hello <world>", "<", ">")', 'world'],
          ]
        },
        REPLACE: {
          description: 'remplace toutes les occurrences d\'une sous chaîne de caractère par une autre.',
          params: 'param, recherche, remplacement',
          examples: [
            ['REPLACE("Hello world", "world", "you")', 'Hello you'],
          ]
        },
        STRPOS: {
          description: 'retourne la position de la première occurrence d\'une sous chaîne de caractère.',
          params: 'param, recherche',
          examples: [
            ['STRPOS("Hello world", "world")', 6],
          ]
        },
        SUM: {
          description: 'effectue la somme de tous les paramètres. Les paramètres vides ou qui ne sont pas des nombres seront ignorés.',
          params: 'param1, param2, ...',
          examples: [
            ['SUM(1, 2, 3)', 6],
          ]
        },
        AVERAGE: {
          description: 'calcule la moyenne de tous les paramètres. Les paramètres vides ou qui ne sont pas des nombres seront ignorés.',
          params: 'param1, param2, ...',
          examples: [
            ['AVERAGE(1, 2, 3)', 2],
          ]
        },
        SPLIT: {
          description: 'utilise le séparateur pour diviser la chaîne de caractères en paramètre et retourne un tableau.',
          params: 'param, séparateur',
          examples: [
            ['SPLIT("Hello world", " ")', ['Hello', 'world']],
          ]
        },
        JOIN: {
          description: 'retourne une chaîne de caractère résultat de la concaténation des éléments du tableau en insérant le séparateur entre chaque élément. Le séparateur par défaut est ",".',
          params: 'tableau, séparateur',
          examples: [
            ['JOIN(["Hello", "world"], " ")', 'Hello world'],
          ]
        },
        MD5: {
          description: 'calcule une signature MD5 de la liste des paramètres.',
          params: 'param1, param2, ...'
        },
        TRANSFORM_DATE: {
          description: 'Transforme une date d\'un format à un autre. La liste des formats est disponible sur la documentation de <a href="https://day.js.org/docs/en/display/format">dayjs</a>. Si un format d\'entrée ou de sortie est laissé vide c\'est un format standard ISO 8601 complet qui est utilisé. "X" est un format spécial pour un timestamp Unix et "x" pour un timestamp Unix en millisecondes. Les paramètres de fuseaux horaires sont optionnels et valent "Europe/Paris" par défaut.',
          params: 'date, format entrée, format sortie, fuseau horaire entrée, fuseau horaire sortie',
          examples: [
            ['TRANSFORM_DATE("2021-01-01T00:00:00Z", "YYYY-MM-DDTHH:mm:ssZ", "DD/MM/YYYY", "UTC", "Europe/Paris")', '01/01/2021'],
          ]
        },
        DEFINED: {
          description: 'Retourne vrai si le paramètre est défini.',
          params: 'param',
          examples: [
            ['DEFINED("Hello world")', true],
            ['DEFINED("")', true],
          ]
        },
        TRUTHY: {
          description: 'Retourne vrai si le paramètre est défini et ne vaut pas false, 0 ou chaîne vide.',
          params: 'param',
          examples: [
            ['TRUTHY("Hello world")', true],
            ['TRUTHY("")', false],
          ]
        }
      }
    }
  },
  computed: {
    functionsArray () {
      return Object.keys(this.functions)
        .filter(key => !this.exclude || !this.exclude.includes(key))
        .map(key => ({ key, ...this.functions[key] }))
    }
  }
}
</script>
