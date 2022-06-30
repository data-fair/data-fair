---
title: Atelier cartographique
section: 6
subsection : 7
updated: 2022-06-30
description : Visualiser différentes données sur une carte
published: false
application : https://koumoul.com/apps/atelier-carto/1.0/
---

La visualisation **Atelier cartographique** permet de projeter des données géolocalisées sur une carte.

Vous avez un exemple de cette visualisation sur notre [se déplacer à vélo](https://opendata.koumoul.com/reuses/se-deplacer-a-velo/full).


### Les concepts

Pour configurer une visualisation **Atelier cartographique**, votre compte actif contient au mois un jeu de données avec [les concepts](./user-guide-backoffice/concept)  **Latitude** et **Longitude** / **Géométrie** d'associés aux colonnes de son schéma.  

### Créer une visualisation Atelier cartographique

Pour réaliser la visualisation, cliquez sur **Visualisations** puis sur **Configurer une visualisation**.

1. Choisissez l'application **Atelier cartographique**
2. Entrez le titre de la visualisation et enregistrez

<p>
</p>

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide-backoffice/carto-factory.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  

### Menu de configuration
Le menu de configuration est composé de deux sous-menus : **Couches de données** et **Autres options**.

#### 1.Couches de données
Dans la section **Couches de données**, vous ajoutez les calques présents dans votre visualisation.  
Un calque correspond à un jeu de données contenant des données géographiques.  
Vous pouvez ajouter plusieurs calques, chaque calque aura sa propre configuration.

Lorsque vous ajoutez un calque, une nouvelle fenêtre est affichée. Cette fenêtre vous permet de configurer le rendu des données de votre calque à l'aide des sections **Source des données**, **Détails au clic**, **Type d'affichage** et **Réglage des couleurs**.

Remarque : Si votre fichier n'est pas disponible dans la section **Source des données**, vérifiez que vous avez bien mis à jour les [concepts](./user-guide-backoffice/concept) **Latitude** et **Longitude** ou **Géométrie** dans votre jeu de données.

**Détails au clic** vous permet de sélectionner plusieurs colonnes à afficher dans la légende lorsqu'un utilisateur de votre visualisation va cliquer sur un éléments de votre calque.

**Type d'affichage** vous permet de définir la représentation de votre calque : un icone unique, des icones en fonction des valeurs d'un champ, des cercles ou encore les géométries présentes dans le jeu de données utilisé pour votre calque.

**Réglage des couleurs** vous permet de définir les couleurs utilisées par votre calque.  
Vous pouvez utiliser une couleur unique, des couleurs en fonction de valeurs dans un intervalle ou en fonction des valeurs d'un ensemble.  
La couleur unique peut être définie dans la configuration.  
Lorsque vous utilisez les couleurs en fonction de valeurs dans un intervalle, trois options de types de palettes s'offrent à vous : **Dégradé entre des couleurs différentes**, **Dégradé même ton de couleurs** ou **Couleurs spécifiques**.  
Le **Champ contenant les valeurs** vous permet de définir la colonne numérique représentée par les couleurs.  
Vous alors pouvez définir des intervalles **de même taille**, par **quantiles** ou en **réglage manuel**.  

#### 2.Autres options

Dans cette section, vous pouvez :
* définir le **Style de carte** parmi près de 10 style différents
* afficher/cacher la recherche par adresse
* activer la géolocalisation
* définir la position initiale de votre carte
