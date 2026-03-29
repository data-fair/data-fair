---
title: Stratégie pour l’exploitabilité et la découvrabilité du catalogue de données
toc: true
---

## Contexte

Les portails de données de la plateforme Data Fair ont pour mission première d'exposer un catalogue de données facile à explorer et à exploiter. Si les utilisateurs humains restent la cible prioritaire, la plateforme est désormais conçue pour être nativement "LLM-ready".

L'objectif est que les agents d'IA (utilisant nos catalogues comme sources de connaissances pour le RAG - Retrieval-Augmented Generation) puissent identifier le bon jeu de données avec la même précision qu'un expert métier.

## Une recherche sémantique augmentée par l'IA

### Indexation full-text de métadonnées riches

Chaque jeu de données porte une description textuelle structurée (titres, descriptions, schémas annotés). Ce contenu est indexé de manière standard pour une recherche performante, prioritairement en langue française. Un assistant IA aide à assurer la complétude des informations.

### Le "Shadow Content" : combler le fossé sémantique

Pour pallier les limites de la recherche par mots-clés sans basculer dans la complexité du vectoriel, Data Fair introduit un champ de "mots-clés associés".

**Le concept :** Un champ de texte libre, non destiné à l'affichage, mais conçu exclusivement pour enrichir l'indexation.

**Le rôle de l'IA :** Un assistant IA génère automatiquement pour ce champ des synonymes, des acronymes (ex: "PLU" pour "Plan Local d'Urbanisme") et des termes de langage courant liés au domaine.

Cela permet de capturer l'intention de l'utilisateur (ou de l'agent) même si le terme exact n'est pas présent dans le titre officiel.

### Aperçu en liste compacte et densité informationnelle

Chaque jeu de données dispose d'un résumé dense. Ce format permet un scan rapide du catalogue, tant pour l'œil humain que pour la fenêtre de contexte d'un LLM, facilitant ainsi la sélection du dataset le plus pertinent parmi une liste de résultats.

## De la structure et du lien

### La donnée comme contexte (Distinct Values)

La plateforme permet d'inclure dans les métadonnées un aperçu des valeurs distinctes de colonnes clés. Pour un agent IA, c'est un outil de "fact-checking" immédiat : il peut confirmer la présence d'une information spécifique (ex: une ville, un code nomenclature) avant même d'interroger la donnée brute.

### Un "graphe" de connaissances

Chaque jeu de données est lié à d'autres via :

- Des choix éditoriaux ("voir aussi").
- Des thématiques.
- Des concepts associés aux colonnes.

Ces liens permettent aux agents IA de naviguer de manière récursive dans le catalogue, passant d'un concept général à un jeu de données spécifique par rebonds logiques.

## Notre position sur la recherche vectorielle

### Le choix de la transparence et de la maîtrise

À ce stade, nous privilégions une recherche explicable. La recherche vectorielle (embeddings), bien que puissante, peut agir comme une "boîte noire" où la pertinence d'un résultat est parfois difficile à justifier ou à corriger. En enrichissant les métadonnées en amont (IA de saisie), nous conservons une recherche déterministe et performante.

### Précision vs Bruit

Dans le contexte de catalogues de données administratives ou techniques, la précision est critique. La recherche vectorielle peut générer du "bruit" en proposant des résultats sémantiquement proches mais techniquement hors-sujet. Notre approche garantit que la pertinence reste pilotée par la qualité de la description, assistée mais non remplacée par l'IA.

### Sobriété et efficacité immédiate

L'approche actuelle évite le surcoût d'infrastructure et la latence induite par les bases de données vectorielles, tout en offrant une précision souvent supérieure sur des catalogues de taille intermédiaire (quelques milliers de jeux de données).

### Vers une hybridation progressive

Nous ne fermons aucune porte. Si la recherche vectorielle pure apporte parfois du "bruit" dans des contextes très structurés, l'évolution vers une recherche hybride (combinant le score textuel BM25 et la proximité vectorielle) est une perspective que nous étudions.

À mesure que les modèles d'embeddings deviennent plus légers et que les volumes de données croissent, l'intégration de couches vectorielles pourrait venir affiner davantage les résultats, sans jamais sacrifier la base solide de métadonnées curées qui fait la force de Data Fair.

## Conclusion

Data Fair mise sur une hybridation intelligente : utiliser la puissance des LLM pour enrichir, structurer et "traduire" les métadonnées en amont, tout en s'appuyant sur des moteurs de recherche robustes et transparents pour l'exploration. Nous rendons le catalogue intelligible pour les machines sans sacrifier la maîtrise et la clarté pour les humains. C'est une stratégie qui garantit une exploitation immédiate par les IA d'aujourd'hui, tout en préparant le terrain pour les technologies de recherche de demain.