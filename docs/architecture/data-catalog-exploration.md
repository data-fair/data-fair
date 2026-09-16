---
title: Stratégie pour l'exploitabilité et la découvrabilité du catalogue de données
toc: true
---

> Mis à jour le 2026-09-16 — décrit ce qui est implémenté dans data-fair ; les perspectives sont dans la dernière section.

## Contexte

Les portails de données de la plateforme Data Fair ont pour mission première d'exposer un catalogue de données facile à explorer et à exploiter. Si les utilisateurs humains restent la cible prioritaire, la plateforme est désormais conçue pour être nativement "LLM-ready".

L'objectif est que les agents d'IA (utilisant nos catalogues comme sources de connaissances pour le RAG - Retrieval-Augmented Generation) puissent identifier le bon jeu de données avec la même précision qu'un expert métier.

> **Périmètre :** ce document traite uniquement de la **découverte** des jeux de données dans le catalogue (recherche, navigation, sélection). L'exploitation des données elles-mêmes (requêtes, téléchargements, visualisations) n'est pas abordée ici.

## Une recherche textuelle adaptée au français

Le catalogue est indexé par l'index texte MongoDB `datasets.fulltext` (`api/src/mongo.ts`), sur les champs suivants, avec leurs poids :

| champ | poids |
|---|---|
| `title` | ×3 |
| `searchTerms` (termes de recherche associés, voir ci-dessous) | ×3 |
| `summary` | ×2 |
| `description` | ×1 |
| `keywords` | ×1 |
| `topics.title` | ×1 |
| `owner.name`, `owner.departmentName` | ×1 |
| `_searchText` (vocabulaire du schéma calculé, voir ci-dessous) | ×1 |

L'analyse linguistique de cet index est le français (racinisation et mots vides), configurable via `config.catalogSearch.language` (`api/config/default.cjs`), par défaut `'french'` — n'importe quel nom de langue reconnu par MongoDB, ou `'none'` pour désactiver la racinisation. Le même réglage de langue s'applique à l'index `applications.fulltext`.

Changer `default_language` change les paramètres de l'index texte, ce que MongoDB refuse en place : `ensureIndex` (`@data-fair/lib-node/mongo.js`) reçoit l'erreur de conflit 85/86, supprime l'index (`dropIndex`) puis le recrée (`createIndex`). Entre ces deux appels, toute requête `$text` sur la collection échoue ("text index required for $text query") : sur le premier pod qui exécute `configure()` après un déploiement changeant ce réglage, la recherche du catalogue côté portail et la liste des jeux de données du back-office renvoient une erreur 500 pendant la reconstruction de l'index. C'est un comportement attendu et transitoire (la reconstruction est rapide sur les volumes visés par cette fonctionnalité), pas un bug ; il n'est pas contourné à ce stade.

Le score reste néanmoins celui d'un moteur sans pondération par rareté (IDF) : il combine la fréquence des termes dans le document et le poids du champ, mais un mot fréquent dans les titres du catalogue pèse autant qu'un mot rare qui désigne précisément le bon jeu de données. Les poids de champ et le vocabulaire ajouté ci-dessous compensent cette limite en pratique, mais un mot générique présent dans le titre peut toujours dépasser une correspondance thématique plus pertinente. Voir la section Perspectives pour la portée exacte de cette limite et son évolution possible.

## Les termes de recherche associés

`searchTerms` est un champ de texte libre par jeu de données (1000 caractères maximum), destiné aux synonymes, sigles avec leur développement (ex. "PLU" → "Plan Local d'Urbanisme") et formulations courantes qui ne figurent pas forcément dans le titre officiel. Il est déclaré dans `api/types/dataset/schema.js`, modifiable dans le formulaire de métadonnées du back-office (`ui/src/components/dataset/metadata/dataset-metadata-form.vue`), et activable par organisation via `settings.datasetsMetadata.searchTerms.active` (par défaut activé).

Ce champ n'est jamais affiché aux visiteurs des portails et n'est pas une facette : c'est précisément pour cela qu'il n'est pas simplement ajouté à `keywords`, qui sert de facette et, sur les catalogues réels, de liste de tags thématiques — y verser des dizaines de synonymes la rendrait inutilisable. Il est indexé au même poids que le titre (×3), car sans IDF un synonyme à poids faible ne peut pas l'emporter sur un mot générique présent dans soixante titres à poids fort.

« Jamais affiché » ne veut pas dire privé : le champ est renvoyé par l'API à quiconque a la permission `readDescription`, y compris un visiteur anonyme d'un jeu de données public — il n'est simplement affiché dans aucune interface. N'y mettez donc pas de jargon interne ou d'information confidentielle.

Il peut être renseigné à la main ou proposé par l'assistant : un bouton d'action `suggest-search-terms` dans le formulaire de métadonnées déclenche le sous-agent `search_terms_writer` (`ui/src/composables/dataset/agent-summary-tools.ts`), qui lit titre, résumé, description, mots-clés, thématiques et schéma pour proposer une liste de termes. Rien n'est enregistré automatiquement : le sous-agent propose, l'utilisateur approuve, et l'outil `set_dataset_metadata` (`ui/src/composables/dataset/agent-metadata-tools-logic.ts`) remplit le champ du formulaire — c'est l'utilisateur qui clique sur Enregistrer.

```mermaid
flowchart LR
    subgraph Requête
        Q["🔍 'logements sociaux\nà Grenoble'"]
    end

    subgraph Shadow["Termes de recherche associés"]
        S1["HLM, habitat social,\nlogement aidé"]
        S2["PLU, Plan Local\nd'Urbanisme"]
        S3["bailleur, OPH,\noffice public"]
    end

    subgraph Dataset["Jeu de données"]
        T["'Répertoire des\nlogements conventionnés\n— Métropole grenobloise'"]
    end

    Q -.->|"terme absent\ndu titre"| T
    Q ==>|"match via\nsynonymes"| Shadow
    Shadow ==> T
```

## Le vocabulaire du schéma dans la recherche

`_searchText` est un champ calculé, jamais saisi à la main, produit par la fonction pure `computeSearchText` (`api/src/datasets/operations.ts`). Il rassemble :

- les titres des colonnes du schéma (tronqués à 200 caractères) et le début de leur description (les 200 premiers caractères, coupés sur un espace ; si aucun espace ne figure dans ces 200 premiers caractères — un jeton unique comme une URL —, la coupe cherche l'espace suivant jusqu'à 400 caractères, au-delà desquels elle retombe sur une troncature brute à 200) — inclus par défaut, désactivable par organisation ;
- les valeurs `enum` (chaînes de caractères) des colonnes — désactivé par défaut, activable par organisation.

Le champ est borné : 8 Kio pour chaque partie (libellés, valeurs), 16 Kio au total ; au-delà de la limite, des colonnes entières sont écartées plutôt que des chaînes tronquées. Les clés de colonnes ne sont volontairement pas indexées : mesuré sur trois catalogues réels, elles n'apportaient aucun gain par rapport aux titres, qui en sont déjà des variantes (`benchmark/catalog-search/FINDINGS.md`, §4).

Une garde de permissions automatique, interne à `computeSearchText`, protège ce contenu : si un ayant droit peut `list` le jeu de données sans avoir `readSchema`, la partie "libellés" est retirée ; sans `readLines`, la partie "valeurs" est retirée. `_searchText` est recalculé à la création du jeu de données, à chaque patch touchant le schéma (ce qui couvre la finalisation, où les valeurs `enum` sont figées), à chaque écriture de permissions, et à chaque changement des réglages d'organisation ci-dessous (`api/src/datasets/service.ts`, `api/src/misc/utils/permissions.ts`, `api/src/settings/service.ts`). Les jeux de données existants ont été rétro-remplis par `api/upgrade/6.20.0/backfill-search-text.ts`. Le champ est systématiquement retiré des réponses de l'API (`api/src/datasets/utils/index.ts`, `api/src/datasets/routes/write.ts`) : il n'existe que pour l'indexation.

Deux réglages d'organisation contrôlent son contenu (`settings.catalogSearch`, `api/types/settings/schema.js`, interface dans `ui/src/components/settings/settings-catalog-search.vue`) :

- `indexSchemaLabels` (par défaut activé) — libellés et descriptions de colonnes ;
- `indexEnumValues` (par défaut désactivé) — valeurs distinctes des colonnes à faible cardinalité.

Un avertissement accompagne les deux réglages : une correspondance de recherche peut révéler qu'une colonne ou une valeur existe à quiconque peut lister le jeu de données, même sans accès à son schéma ou à ses lignes ; les jeux de données exposés à de tels lecteurs sont automatiquement exclus par la garde ci-dessus.

## Aperçu en liste compacte

Chaque jeu de données dispose d'un titre et d'un résumé dense. Ce format permet un scan rapide du catalogue, tant pour l'œil humain que pour la fenêtre de contexte d'un LLM, facilitant la sélection du jeu de données le plus pertinent parmi une liste de résultats.

## Un aperçu des données dès les métadonnées

La plateforme permet d'inclure dans les métadonnées un aperçu des valeurs distinctes de colonnes clés. Pour un agent IA, c'est un outil de "fact-checking" immédiat : il peut confirmer la présence d'une information spécifique (ex: une ville, un code nomenclature) avant même d'interroger la donnée brute.

Cet aperçu a des limites qu'un agent doit connaître : il est calculé automatiquement, uniquement pour les colonnes ayant au plus 50 valeurs distinctes, et il est absent pour les colonnes trop clairsemées ou à trop forte cardinalité. L'absence d'une valeur dans cet aperçu ne prouve donc rien sur sa présence dans les données — un agent ne doit pas la lire comme une preuve d'absence.

## Un "graphe" de connaissances pour naviguer le catalogue

Chaque jeu de données est lié à d'autres via :

- Des choix éditoriaux ("voir aussi").
- Des thématiques.
- Des concepts associés aux colonnes.

Ces liens permettent aux agents IA de naviguer de manière récursive dans le catalogue, passant d'un concept général à un jeu de données spécifique par rebonds logiques. Cette navigation n'est aujourd'hui exposée aux agents qu'en partie (voir ci-dessous) ; l'exposition complète (facettes et filtres sur `list_datasets`, `relatedDatasets` dans `describe_dataset`) est l'objet d'une spécification séparée (spec B).

```mermaid
graph LR
    A["Thématique:\nUrbanisme"] --> B["PLU communal"]
    A --> C["Permis de construire"]
    B -->|"voir aussi"| C
    B -->|"concept: parcelle"| D["Cadastre parcellaire"]
    C -->|"concept: parcelle"| D
    D -->|"concept: commune"| E["Référentiel communes"]

    style A fill:#e3f2fd,stroke:#1565c0
    style B fill:#fff3e0,stroke:#e65100
    style C fill:#fff3e0,stroke:#e65100
    style D fill:#fff3e0,stroke:#e65100
    style E fill:#fff3e0,stroke:#e65100
```

## Deux interfaces

L'exploration du catalogue est exposée via deux interfaces complémentaires : l'API REST du portail et un serveur MCP.

```mermaid
flowchart LR
    subgraph Catalogue["Catalogue de données"]
        API["API REST\n(Open API)"]
        MCP["Serveur MCP"]
    end

    H["Utilisateur humain"] -->|"Interface web"| API
    L["Agent IA / LLM"] -->|"Protocole MCP"| MCP
    L -->|"Appels HTTP"| API

    MCP -->|"condense et\nstructure"| API
```

### Interface humaine : le portail web

L'interface web s'appuie sur une API REST documentée via Open API. Cette documentation exhaustive constitue le contrat de référence de la plateforme et peut être consommée directement par tout client HTTP, y compris des agents IA. Elle bénéficie pleinement de la recherche textuelle décrite ci-dessus.

### Interface machine : le serveur MCP

Le serveur [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) n'est pas contenu dans ce dépôt : c'est un projet séparé, `@data-fair/mcp`, déployé sur les portails qui l'activent (par exemple `/mcp-server/datasets/mcp`). Il condense l'information de l'API Open API en un ensemble d'outils plus compacts pour la fenêtre de contexte d'un LLM.

À ce jour, son outil `list_datasets` ne prend que trois paramètres : `q`, `page` et `size`. Il n'expose ni facettes, ni filtre par thématique ou concept, ni `relatedDatasets` : un agent qui passe par le MCP bénéficie de la recherche textuelle améliorée décrite plus haut, mais pas encore de la navigation par facettes ou par le graphe de connaissances. Combler cet écart entre les deux interfaces est l'objet de la spécification B, distincte du présent travail.

L'intérêt du serveur MCP par rapport à l'utilisation directe de l'API reste la concision : les descriptions d'outils, les paramètres et les réponses sont formulés de manière compacte et sémantiquement claire pour un LLM, évitant le bruit d'une spécification Open API complète.

## Notre position sur la recherche vectorielle

À ce stade, nous privilégions une recherche explicable. La recherche vectorielle (embeddings), bien que puissante, peut agir comme une "boîte noire" où la pertinence d'un résultat est parfois difficile à justifier ou à corriger. En enrichissant les métadonnées en amont (IA de saisie), nous conservons une recherche déterministe et performante.

Dans le contexte de catalogues de données administratives ou techniques, la précision est critique. La recherche vectorielle peut générer du "bruit" en proposant des résultats sémantiquement proches mais techniquement hors-sujet. Notre approche garantit que la pertinence reste pilotée par la qualité de la description, assistée mais non remplacée par l'IA.

L'approche actuelle évite le surcoût d'infrastructure et la latence induite par les bases de données vectorielles : à ce stade, nous faisons ce choix de positionnement pour des catalogues de taille intermédiaire, sans que cela ait été mesuré contre un moteur vectoriel. Sur la question voisine — un index plein texte Mongo contre un index plein texte Elasticsearch, sans dimension vectorielle — la mesure existe : sur des catalogues de 100 à 200 jeux de données, un index Mongo en français rejoint un index Elasticsearch en full-text une fois le même contenu indexé des deux côtés, et Elasticsearch ne prend l'avantage que sur la classe de requêtes à mots génériques identifiée plus haut comme le plafond du moteur Mongo ([`benchmark/catalog-search/FINDINGS.md`](../../benchmark/catalog-search/FINDINGS.md), [`benchmark/catalog-search/ES-EVALUATION.md`](../../benchmark/catalog-search/ES-EVALUATION.md)).

```mermaid
quadrantChart
    title Positionnement de la recherche
    x-axis "Faible explicabilité" --> "Forte explicabilité"
    y-axis "Faible couverture" --> "Forte couverture"
    "Full-text basique": [0.8, 0.25]
    "Vectoriel pur": [0.2, 0.7]
    "Data Fair full-text enrichi IA": [0.75, 0.65]
    "Hybride futur": [0.6, 0.85]
```

## Perspectives

Trois évolutions sont documentées mais non construites, chacune avec la condition qui la déclencherait. Dans les trois cas, la source de preuve serait les journaux HTTP des portails en production, pas encore disponibles.

- **Suppression de termes fréquents au moment de la requête** : ignorer un terme présent dans plus de 30% du catalogue quand un terme plus rare subsiste dans la requête, avec un comptage mis en cache par terme. Mesuré comme efficace contre le plafond décrit ci-dessus (`benchmark/catalog-search/FINDINGS.md`, §4b — l'index Mongo français rejoint les scores obtenus avec Elasticsearch sur les requêtes à mots génériques). Déclencheur : des journaux de requêtes en production montrant le motif "liste des X de France".
- **Thésaurus de synonymes au niveau organisation** : une table de sigles/synonymes appliquée en expansion de requête, sans passer par les termes de recherche associés de chaque jeu de données. Déclencheur : les mêmes sigles revenant dans les `searchTerms` de nombreux jeux de données d'une même organisation.
- **Index catalogue sur Elasticsearch**, avec synchronisation par marquage "sale" sur les points d'écriture, jetons `_listProfiles` pour reproduire les permissions avec hydratation Mongo comme filet de sécurité, et bascule automatique vers l'index Mongo en cas d'erreur (détail complet dans [`benchmark/catalog-search/ES-EVALUATION.md`](../../benchmark/catalog-search/ES-EVALUATION.md)). Déclencheurs : le retour d'un besoin de recherche centralisée multi-ressources (jeux de données, applications, pages de portail), ou des catalogues d'un ordre de grandeur plus grands que ceux mesurés ici (quelques centaines de jeux de données).

## Conclusion

Data Fair mise sur une recherche textuelle explicable, en français, enrichie par deux mécanismes concrets : des termes de recherche associés que l'utilisateur ou l'assistant peuvent renseigner, et un vocabulaire de schéma calculé automatiquement sous garde de permissions. Ces mécanismes fonctionnent à l'intérieur d'une limite connue et assumée — l'absence de pondération par rareté — que seul un moteur comme Elasticsearch lèverait complètement, et dont la trace est documentée pour orienter une décision future plutôt que prise par anticipation.

Les deux interfaces d'accès au catalogue, portail web et serveur MCP, s'appuient sur la même recherche textuelle ; leur parité fonctionnelle sur les facettes et le graphe de connaissances n'est pas encore acquise et fait l'objet d'un travail séparé.
