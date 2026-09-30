# Simulations de l'assistant IA — état des lieux QA

État au 30/09/2026 (v6.21.0).

## En bref

Six parcours de l'assistant IA sont couverts par des simulations jugées, et les six étaient satisfaisants à leur dernier run. Ce vert est à prendre avec prudence :

- **Pas de vérification sur la version livrée.** Aucun de ces runs n'a tourné sur la v6.21.0 exacte.
- **Un seul run par verdict.** Deux cas sont fragiles : `chiffres-de-l-utilisateur` et `creation-guidee-jeu-de-donnees`.
- **Couverture partielle.** 6 des 17 parcours documentés sont couverts, aucun ne concerne les applications.

La suite date de la v6.21.0. En deux semaines, elle a déjà fait corriger le prompt, plusieurs outils et un défaut d'enregistrement de ligne que les tests classiques n'avaient pas vus.

## Cas couverts

Sept cas ; les six premiers étaient « satisfaisant » à leur dernier run avant la v6.21.0. Aucun de ces runs n'a tourné sur le code exact de la v6.21.0. Toutes les personas sont des agents de petite collectivité, non techniques, en français.

| Cas | Ce que la personne veut | Ce qui est vérifié | Dernier verdict | Solidité |
| --- | --- | --- | --- | --- |
| `lien-ouvert-par-l-utilisateur` | Un lien vers les équipements de plus de 500 places, ouvert elle-même | Lien filtré correct ; le chat reste utilisable après la navigation | Satisfaisant, 0 friction (17/09) | Stable : satisfaisant à chaque run valide depuis le 14/09 |
| `question-sur-les-donnees` | Les équipements de plus de 500 places, affichés à l'écran | L'assistant navigue lui-même vers une vue filtrée | Satisfaisant, 0 friction (17/09) | Stable ; un run à 5 frictions le 16/09 |
| `chiffres-de-l-utilisateur` | Confirmer un nombre de stades en avançant des chiffres faux | L'assistant revérifie dans les données au lieu de calculer sur les chiffres de l'utilisateur | Satisfaisant « de justesse », 2 frictions (17/09) | Fragile : insatisfaisant le 16/09 (« 8 stades » au lieu de 3) |
| `termes-de-recherche-caches` | Être trouvée sur « gymnase », « piscine » dans le portail | Termes proposés dans le formulaire, rien d'enregistré sans elle | Satisfaisant (16/09) | Un seul run, avant la fusion de la recherche catalogue |
| `creation-guidee-jeu-de-donnees` | Un registre neuf (campagne 2027) de demandes de subvention, éditable avec historique — objectif resserré le 30/09 sur ce que les outils savent faire | L'assistant prépare l'assistant de création, la personne clique, puis il enchaîne seul | Satisfaisant, 2 frictions (18/09) | Le plus instable : environ 8 runs insatisfaisants entre le 14 et le 17/09 |
| `saisie-et-correction-d-une-demande` | Saisir une demande et corriger un montant à 12 000 € au lieu de 1 200 € | Ouverture des formulaires de ligne, pré-remplissage, la personne enregistre | Satisfaisant, 0 friction (28/09) | Le plus récent ; un run du 28/09 avait ouvert la mauvaise ligne |
| `question-avant-enregistrement` | Enregistrer une demande, mais poser une question avant d'appuyer sur Enregistrer | L'assistant répond à partir de ce qu'il a déjà fait, sans tout refaire, et rend le même formulaire | Pas encore exécuté (ajouté le 30/09) | — |

Les frictions encore ouvertes au dernier run : une route `edit-schema` inexistante proposée après la création, un bug de schéma de sortie de `calculate_metric` (percentiles), et un tableau recopié dans le chat alors qu'il est déjà à l'écran.

## Évolution de la couverture

Toute la suite est arrivée dans la v6.21.0. Il n'y avait aucune simulation en v6.20 ni avant. Elle est passée de 3 à 6 cas en deux semaines, et chaque ajout accompagnait une fonctionnalité de l'assistant.

| Date | PR | Cas | Ce que la simulation a fait changer |
| --- | --- | --- | --- |
| 28/09 | #594 ouverture des dialogues | `saisie-et-correction` ajusté | L'assistant attend que les outils du formulaire soient prêts avant de continuer ; il ouvrait parfois la mauvaise ligne |
| 22/09 | #582 recherche catalogue | +1 : `termes-de-recherche-caches` | Le bouton de termes cachés est validé par un cas qui peut échouer |
| 21/09 | #580 parcours guidés | +2 : `creation-guidee`, `saisie-et-correction` | Événements envoyés par l'application à l'assistant, outil `add_columns`, `_id` conservé dans la saisie de ligne |
| 14/09 | #574 suite initiale | 3 : `lien-ouvert`, `question-sur-les-donnees`, `chiffres-de-l-utilisateur` | Consigne ajoutée : l'assistant revérifie les chiffres donnés par l'utilisateur. Correction d'un nom d'outil erroné dans le prompt |

Le 16/09, une persona sur Haiku abandonnait parfois sa prémisse, et le cas ne testait alors plus rien. La persona tourne désormais sur Sonnet.

## Limites et prochaines étapes

La priorité est de mesurer la v6.21.0 telle qu'elle est livrée. Viennent ensuite les applications, qui n'ont aucun cas.

1. **Établir une référence v6.21.0.** Aucun verdict actuel n'a tourné sur la version livrée, et un run isolé ne prouve rien pour un assistant non déterministe. Il faut lancer chaque cas plusieurs fois (3, par exemple) avec l'assistant sur Sonnet, puis autant avec l'assistant sur Haiku. On note ensuite un taux de réussite par cas et par modèle.
2. **Relancer `termes-de-recherche-caches`.** Ce cas n'a jamais tourné sur le code fusionné de la recherche catalogue.
3. **Corriger les frictions ouvertes** : la route `edit-schema` inexistante et les percentiles de `calculate_metric`.
4. **Couvrir les parcours manquants** (11 sur 17), en commençant par la création et la configuration d'application, puis la description d'un jeu de données et l'annotation de son schéma. Restent ensuite :
   - l'expression calculée ;
   - l'optimisation des colonnes ;
   - le contrôle qualité ;
   - le résumé des changements ;
   - les notes de version.
5. **Varier les profils.** Tous les cas mettent en scène un agent de collectivité non technique, francophone et administrateur. Il faut ajouter un cas en anglais et un cas sans droit d'écriture.
6. **Fixer un rythme.** On relance la suite avant chaque version qui touche l'assistant. Chaque run consomme du quota Claude et réinitialise les données de test du poste.

## Fonctionnement

Un utilisateur simulé (la persona) poursuit un objectif avec le vrai assistant, dans un vrai navigateur. Un juge lit ensuite le transcript et rend un verdict, avec la liste des frictions rencontrées.

- **Un cas = une page, une persona, un objectif**, sans résultat attendu écrit à l'avance.
- **La persona tourne sur Sonnet**, pour simuler un utilisateur crédible. Elle regarde l'écran, clique et saisit.
- **L'assistant tourne sur Sonnet par défaut, et doit aussi être validé sur Haiku.** Un parcours que seul un grand modèle réussit n'est pas assez guidé. Les sous-agents et la modération tournent sur Haiku.
- **Un run invalide n'est pas un échec produit.** Une limite de débit ou une panne du pont vers le modèle rend le run invalide, et il n'est pas jugé.

La suite se lance avec le skill `/agents-sim`. Elle reste hors de `npm test` et de la CI, à cause de son coût en quota.
