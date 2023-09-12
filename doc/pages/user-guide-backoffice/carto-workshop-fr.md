---
title: Atelier cartographique
section: 6
subsection : 7
updated: 2022-06-30
description : Visualiser différentes données sur une carte
published: true
application : https://koumoul.com/apps/atelier-carto/1.0/
---

La visualisation **atelier cartographique** permet de projeter des données géolocalisées sur une carte.

Vous avez un exemple de cette visualisation sur notre carte [se déplacer à vélo](https://opendata.koumoul.com/reuses/se-deplacer-a-velo/full).


## Les concepts

Pour configurer une visualisation **atelier cartographique**, votre compte actif contient au moins un jeu de données avec [les concepts](./user-guide-backoffice/concept)  **latitude** et **longitude** / **géométrie** associés aux colonnes de son schéma.  

## Créer une visualisation atelier cartographique

Pour réaliser la visualisation, cliquez sur **visualisations** puis sur **configurer une visualisation**.

1. Choisissez l'application **atelier cartographique**&nbsp;;
2. Entrez le titre de la visualisation et enregistrez.

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections&nbsp;:

1. Informations&nbsp;;
2. Boutons d'action (plein écran, intégration sur un site, capture...)&nbsp;;
3. Menu de configuration&nbsp;;
4. Aperçu.

![Page de configuration](./images/user-guide-backoffice/carto-factory.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

## Menu de configuration
Le menu de configuration est composé de deux sous-menus&nbsp;: **couches de données** et **autres options**.

### 1. Couches de données
Dans la section **couches de données**, vous ajoutez les calques présents dans votre visualisation.  
Un calque correspond à un jeu de données contenant des données géographiques.  
Vous pouvez ajouter plusieurs calques, chaque calque aura sa propre configuration.

Lorsque vous ajoutez un calque, une nouvelle fenêtre est affichée. Cette fenêtre vous permet de configurer le rendu des données de votre calque à l'aide des sections **source des données**, **détails au clic**, **type d'affichage** et **réglage des couleurs**.

**Remarque**&nbsp;: si votre fichier n'est pas disponible dans la section **source des données**, vérifiez que vous avez bien mis à jour les [concepts](./user-guide-backoffice/concept) **latitude** et **longitude** ou **géométrie** dans votre jeu de données.

**Détails au clic** vous permet de sélectionner plusieurs colonnes à afficher dans la légende lorsqu'un utilisateur de votre visualisation clique sur un élément de votre calque.

**Type d'affichage** vous permet de définir la représentation de votre calque&nbsp;: un icône unique, des icônes en fonction des valeurs d'un champ, des cercles ou encore les géométries présentes dans le jeu de données utilisé pour votre calque.

**Réglage des couleurs** vous permet de définir les couleurs utilisées par votre calque.  
Vous pouvez utiliser une couleur unique, des couleurs en fonction des valeurs dans un intervalle ou en fonction des valeurs d'un ensemble.  
La couleur unique peut être définie dans la configuration.  
Lorsque vous utilisez les couleurs en fonction de valeurs dans un intervalle, trois options de types de palettes s'offrent à vous&nbsp;: **dégradé entre des couleurs différentes**, **dégradé même ton de couleurs** ou **couleurs spécifiques**.  
Le **champ contenant les valeurs** vous permet de définir la colonne numérique représentée par les couleurs.  
Vous alors pouvez définir des intervalles **de même taille**, par **quantiles** ou en **réglage manuel**.  

![Calques](./images/user-guide-backoffice/calques.jpg)  
*Chaque cadre represente un calque*

### 2. Autres options

Dans cette section, vous pouvez&nbsp;:
* définir le **style de carte** parmi près de dix styles différents&nbsp;;
* afficher/cacher la recherche par adresse&nbsp;;
* activer la géolocalisation&nbsp;;
* définir la position initiale de votre carte.
