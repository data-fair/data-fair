/**
 * The "Cache et fraîcheur des données" section of the API doc descriptions (root doc, and the
 * public and private per-dataset docs that expose /lines). It states the consumer side of the
 * caching contract of docs/architecture/caching.md, "Consistency across requests".
 *
 * `publicData` is whether an anonymous caller may read the data, the same test the cache headers
 * use to choose between a shared (`public`) and a `private` Cache-Control. Per-dataset docs pass it
 * so the text describes what the reader will actually get; left undefined (root doc, other callers)
 * the text covers both cases.
 * Config-free so the doc generators stay importable from unit tests.
 */
const readOperations = '(`/lines`, `/values_agg`, `/values/{field}`, `/metric_agg`, `/geo_agg`, etc.)'

const publicIntro = 'peuvent être conservées quelques minutes par les caches HTTP (voir l\'en-tête `Cache-Control`), chaque URL indépendamment des autres : juste après une mise à jour, une requête peut encore renvoyer les données précédentes.'
const privateIntro = 'ne sont conservées par aucun cache partagé et sont revalidées à chaque requête.'

const finalizedAtUsage = 'ajoutez à chaque requête le paramètre `finalizedAt` avec la valeur, telle quelle, de la propriété `finalizedAt` des informations du jeu de données (`GET /datasets/{id}`, jamais mis en cache). Les réponses contiennent alors des données au moins aussi récentes que cette version'
const finalizedAtLimits = 'Relisez `finalizedAt` au début de chaque série de requêtes pour suivre les mises à jour. Ce paramètre ne permet pas de consulter une version antérieure, et si le jeu de données est mis à jour pendant une série de requêtes, certaines réponses peuvent déjà contenir les nouvelles données.'

export const consistencyGuide = (publicData?: boolean): string => {
  let intro: string
  let usage: string
  if (publicData === true) {
    intro = `ce jeu de données est public : les réponses des opérations de lecture des données ${readOperations} ${publicIntro}`
    usage = `Pour ne jamais recevoir de données antérieures à une version connue tout en profitant du cache, ${finalizedAtUsage}, et peuvent être conservées longtemps par les caches.`
  } else if (publicData === false) {
    intro = `ce jeu de données n'est pas public : les réponses des opérations de lecture des données ${readOperations} ${privateIntro}`
    usage = `Pour profiter du cache de votre client HTTP sans jamais recevoir de données antérieures à une version connue, ${finalizedAtUsage}, et peuvent être conservées longtemps par votre client HTTP.`
  } else {
    intro = `lorsque le jeu de données est public, les réponses des opérations de lecture des données ${readOperations} ${publicIntro} Lorsqu'il est privé, elles ${privateIntro}`
    usage = `Pour ne jamais recevoir de données antérieures à une version connue tout en profitant du cache, ${finalizedAtUsage}, et peuvent être conservées longtemps par les caches — pour un jeu de données privé, par le cache de votre seul client HTTP.`
  }
  return `
**Cache et fraîcheur des données** — ${intro}

${usage} ${finalizedAtLimits}
`
}
