# Simulations de l'assistant IA — état des lieux QA

État au 30/09/2026, référence mesurée sur la branche `chore-more-agent-sims` (pas encore livrée), avec les dépendances publiées : image `agents:main` (a0f401f), `@data-fair/lib-agents-sim` 0.8.0, `@koumoul/vjsf` 4.6.1.

## En bref

Avec l'assistant sur Sonnet, 13 runs sur 14 sont satisfaisants. Avec l'assistant sur Haiku, 5 sur 7. Le matin même, avant les corrections, Sonnet n'en réussissait que 6 sur 12.

- **Les parcours de consultation sont solides** : lien filtré, question sur les données, chiffres erronés de l'utilisateur. Ils réussissent avec les deux modèles.
- **Les parcours de saisie tiennent avec Sonnet** : création guidée, saisie et correction de lignes, question avant enregistrement.
- **Avec Haiku, ils restent fragiles.** Haiku oublie de reprendre l'attente après une interruption, invente parfois un chiffre et se trompe de page.
- **Un cas échoue par construction** : `creation-guidee-jeu-de-donnees` demande un seul clic, alors qu'un jeu éditable en exige deux.

La journée a produit une quinzaine de corrections dans data-fair, l'assistant, le harnais de simulation, vjsf et portals. Elles sont détaillées plus bas.

## Résultats de la référence

Deux passes avec l'assistant sur Sonnet, une passe sur Haiku. La persona tourne toujours sur Sonnet. Entre parenthèses : le nombre de frictions relevées par le juge.

| Cas | Ce que la personne veut | Sonnet 1 | Sonnet 2 | Haiku |
| --- | --- | --- | --- | --- |
| `lien-ouvert-par-l-utilisateur` | Un lien vers les équipements de plus de 500 places, qu'elle ouvre elle-même | ✓ (1) | ✓ (2) | ✓ (1) |
| `question-sur-les-donnees` | Les équipements de plus de 500 places, affichés à l'écran | ✓ (0) | ✓ (5) | ✓ (0) |
| `chiffres-de-l-utilisateur` | Confirmer un nombre de stades en avançant des chiffres faux | ✓ (2) | ✓ (2) | ✓ (2) |
| `termes-de-recherche-caches` | Être trouvée sur « gymnase », « piscine » dans le portail | ✓ (0) | ✓ (0) | ✓ (6) |
| `creation-guidee-jeu-de-donnees` | Un registre neuf (campagne 2027), éditable, avec historique | ✗ | ✓ (0) | ✗ |
| `saisie-et-correction-d-une-demande` | Saisir une demande et corriger un montant de 12 000 € en 1 200 € | ✓ (2) | ✓ (2) | ✗ |
| `question-avant-enregistrement` | Poser une question avant d'appuyer sur Enregistrer | ✓ (0) | ✓ (1) | ✓ (1) |

Pourquoi les trois échecs :

- **`creation`, Sonnet 1 et Haiku.** Après « Créer », un jeu éditable demande un second clic, sur « Enregistrer », pour valider ses colonnes. L'objectif du cas ne l'accepte pas, et l'assistant ne l'annonce pas avant la création. Haiku a en plus affirmé à tort que l'historique note qui a modifié quoi : aucun outil ne sait activer ce suivi.
- **`saisie`, Haiku.** L'assistant est allé sur le tableau en lecture seule au lieu de la page de saisie, puis a déclaré la saisie impossible. Corrigé depuis : `list_datasets` signale désormais les jeux éditables et leur page de saisie. Avec cette correction, Haiku a réussi ce cas 2 fois sur 2.

## Ce que la référence a fait corriger

Une référence prise le matin sur la même base a échoué sur trois cas. Chaque échec venait d'une cause précise, corrigée dans la journée puis vérifiée par une nouvelle simulation.

| Constat | Correction | Où |
| --- | --- | --- |
| Quand la personne écrivait pendant une attente, l'assistant oubliait tout ce qu'il venait de faire et recommençait | Le tour interrompu est conservé dans l'historique | agents |
| L'assistant passait la main sans rien dire : seule l'étiquette « En attente » s'affichait | L'attente porte un message pour la personne, affiché dans le chat | agents |
| Le récapitulatif des modifications ignorait les termes de recherche | Champ ajouté, avec un test qui détecte tout nouvel oubli | data-fair |
| Le 29–31 du mois, une date de février s'affichait en mars dans le formulaire de ligne, et pouvait être enregistrée ainsi | Construction des dates corrigée | vjsf 4.6.1 |
| Les liens promettaient des colonnes que le tableau ne masquait pas | Paramètre `cols=` au lieu de `select=` | data-fair, portals |
| Les nombres s'affichaient à l'anglaise (« 1,987 ») | Format de la langue de l'interface ; années non groupées | data-fair |
| L'assistant déduisait à tort qu'un registre n'avait pas d'historique | `describe_dataset` indique l'historique, le suivi des modifications et la provenance | data-fair |
| Les colonnes créées semblaient sans libellé | `describe_dataset` montre le libellé affiché par l'interface | data-fair |
| La persona lisait une page tronquée au milieu d'un champ, ou relue avant la fin d'une navigation | Page élaguée et coupée en fin de ligne ; lecture stabilisée après un clic | harnais |
| La persona écrivait avant d'avoir lu la réponse à son propre clic, ou son message n'était jamais envoyé | Message périmé écarté ; envoi vérifié | harnais |

## Limites et prochaines étapes

1. **Reprise de l'attente avec Haiku.** Après une interruption, Sonnet reprend l'attente dans tous les cas observés, Haiku seulement 1 fois sur 5. Un rappel placé dans le tour suivant, en cours de validation, ne suffit pas pour Haiku. Il reste à faire surveiller l'action attendue par le chat lui-même, sans dépendre du modèle.
2. **Cas `creation`.** Il faut soit accepter le second clic dans l'objectif, soit permettre d'initialiser le jeu depuis un jeu existant. Il manque aussi un outil pour activer le suivi « qui a modifié quoi ».
3. **Sous-agent de données.** Il invente parfois un lien incomplet, un titre, ou un filtre mal formé.
4. **Modèle cible.** Le modèle envisagé en production est DeepSeek V4.1 Flash. Ses benchmarks agentiques le placent plutôt au niveau de Sonnet, mais seule une passe de simulation dira s'il reprend l'attente comme Sonnet ou l'oublie comme Haiku.
5. **Couverture.** 7 cas couvrent 6 des 17 parcours documentés, et aucun ne concerne les applications. Il faut aussi un cas en anglais et un cas sans droit d'écriture.
6. **Rythme.** On relance la suite avant chaque version qui touche l'assistant : deux passes Sonnet et une passe sur le modèle cible. Chaque run consomme du quota et réinitialise les données de test du poste.

## Fonctionnement

Un utilisateur simulé (la persona) poursuit un objectif avec le vrai assistant, dans un vrai navigateur. Un juge lit ensuite le transcript et rend un verdict, avec la liste des frictions rencontrées.

- **Un cas = une page, une persona, un objectif**, sans résultat attendu écrit à l'avance.
- **La persona tourne sur Sonnet**, pour simuler un utilisateur crédible. Elle regarde l'écran, clique et saisit.
- **L'assistant tourne sur Sonnet par défaut, et doit aussi être validé sur Haiku.** Un parcours que seul un grand modèle réussit n'est pas assez guidé. Les sous-agents et la modération tournent sur Haiku.
- **Un run invalide n'est pas un échec produit.** Une limite de débit, un refus du service ou une panne du pont vers le modèle rend le run invalide, et il n'est pas jugé.

La suite se lance avec le skill `/agents-sim`. Elle reste hors de `npm test` et de la CI, à cause de son coût en quota.
