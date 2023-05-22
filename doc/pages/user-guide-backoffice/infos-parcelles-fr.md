---
title: Infos parcelles
section: 6
subsection : 4
updated: 2021-09-20
description : Projeter vos données sur le plan cadastral français.
published: true
application : https://koumoul.com/apps/infos-parcelles/2.4/
---

La visualisation **Infos-parcelles** permet de projeter ses données sur un plan cadastral français interactif.  

## Prérequis

Pour visualiser vos données sur **Infos-parcelles**, votre jeu de données doit contenir une colonne d'**identifiants de parcelles sur 14 caractères**. Ces identifiant (ou code parcelles) sont constitués de cette méthode : code commune INSEE de 5 chiffres + code section cadastre de 5 caractères + numéro parcelle cadastre de 4 chiffres = identifiant de parcelle structuré pour Infos-Parcelles.

Par exemple **56197037ZC0063** est un code valide pour **Infos-parcelles**. Vous pouvez consulter ce [jeu de données de parcelles agricoles gérées par la régie agricole de la Ville de Toulouse](https://koumoul.com/data-fair/api/v1/datasets/domaine-agricole-toulouse/full) qui possède une colonne avec des identifiants sur 14 caractères valides pour Infos-parcelles.

Votre jeu de données doit aussi contenir des latitudes et longitudes associées à chaque code parcelle.  
Si vous n'avez que des identifiants de 14 caractères, il est possible d'[enrichir votre jeu de données](./user-guide-backoffice/enrichment) et d'importer les latitudes et longitudes en fonction des identifiants de parcelles à l'aide de l'enrichissement **cadastre** de la plateforme Koumoul.

## Les concepts
Pour configurer une visualisation **Infos-parcelles**, votre compte actif contient au moins un jeu de données avec [les concepts](./user-guide-backoffice/concept) **Code parcelle**, **Latitude** et **Longitude** associés dans son schéma.

Une fois que vous avez mis à jour le schéma de vos données, la prévisualisation **Carte** est disponible dans la section des **Données**. Vous pouvez ainsi vérifier que vos données sont correctement projetées sur une carte.

## Créer une visualisation Infos-parcelles

Pour créer une visualisation, vous pouvez aller dans la section **Visualisations** de votre jeu de données ou dans la barre de navigation de Data&nbsp;Fair, cliquez ensuite sur **Configurer une visualisation**.

1. Choisir l'application **Infos-parcelles**
2. Entrer le titre de la visualisation

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections:

1. Informations
2. Boutons d'actions (plein écran, intégration sur un site, capture, ... )
3. Menu de configuration
4. Aperçu

![Page de configuration](./images/user-guide-backoffice/infos-parcelles-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  
Les boutons d'actions vous permettent d'importer l'application sur un autre site, de dupliquer l'application, de la supprimer et d'accéder à l'application en plein écran.

## Menu de configuration
Le menu de configuration est composé de trois sous-menus : **Sources de données**, **Options de rendu** et **Navigation**.

### 1.Sources des données  

Dans le menu **Sources de données**, choisissez le jeu de données que vous venez de préparer avec les concepts.

Remarque : Si votre fichier n'est pas disponible dans ce menu, vérifiez que vous avez bien mis à jour les [concepts](./user-guide-backoffice/concept) **Code parcelle**, **Latitude** et **Longitude** dans votre jeu de données.

Lorsque vous avez choisi un jeu de données compatible avec l'application **Infos-parcelles**, votre aperçu de carte s'affiche avec les points de vos données.  
Pour le moment, les points sont tous de la même couleur et vous n'avez que les données cadastrales par default.  

### 2.Options de rendu  

Dans le menu **Options de rendu**, renseignez la colonne de votre légende avec le paramètre **Couleur par valeur d'un champ**.  
Dans le paramètre **Infobulle**, vous pouvez sélectionner plusieurs colonnes pour les afficher lorsque qu'un utilisateur de votre visualisation aura cliqué sur une parcelle.

### 3.Navigation  

Dans le menu **Navigation**, vous pouvez cacher la barre de recherche et activer ou désactiver la géolocalisation.

Lorsque vous avez un aperçu qui vous satisfait, cliquez sur **Enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
