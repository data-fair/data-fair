---
title: Infos parcelles
section: 6
subsection : 4
updated: 2021-09-20
description : Projeter vos données sur le plan cadastral français.
published: true
application : https://koumoul.com/apps/infos-parcelles/2.4/
---

La visualisation **infos parcelles** permet de projeter ses données sur un plan cadastral français interactif.  

## Prérequis

Pour visualiser vos données sur **infos parcelles**, votre jeu de données doit contenir une colonne d'**identifiants de parcelles sur 14 caractères**. Ces identifiants (ou codes parcelles) sont constitués de cette manière&nbsp;: code commune INSEE de 5 chiffres + code section cadastre de 5 caractères + numéro parcelle cadastre de 4 chiffres = identifiant de parcelle structuré pour infos parcelles.

Par exemple, **56197037ZC0063** est un code valide pour **infos parcelles**. Vous pouvez consulter ce [jeu de données de parcelles agricoles gérées par la régie agricole de la Ville de Toulouse](https://koumoul.com/data-fair/api/v1/datasets/domaine-agricole-toulouse/full) qui possède une colonne avec des identifiants sur 14 caractères.

Votre jeu de données doit aussi contenir des latitudes et longitudes associées à chaque code parcelle.  
Si vous n'avez que des identifiants de 14 caractères, il est possible d'[enrichir votre jeu de données](./user-guide-backoffice/enrichment) et d'importer les latitudes et longitudes en fonction des identifiants de parcelles à l'aide de l'enrichissement **cadastre** de la plateforme Koumoul.

## Les concepts
Pour configurer une visualisation **infos parcelles**, votre compte actif contient au moins un jeu de données avec [les concepts](./user-guide-backoffice/concept) **code parcelle**, **latitude** et **longitude** associés dans son schéma.

Une fois que vous avez mis à jour le schéma de vos données, la prévisualisation **carte** est disponible dans la section des **données**. Vous pouvez ainsi vérifier que vos données sont correctement projetées sur une carte.

## Créer une visualisation infos parcelles

Pour créer une visualisation, vous pouvez aller dans la section **visualisations** de votre jeu de données ou dans la barre de navigation de Data&nbsp;Fair, cliquez ensuite sur **configurer une visualisation**.

1. Choisir l'application **infos parcelles**&nbsp;;
2. Entrer le titre de la visualisation.

Vous êtes redirigé vers la page de configuration de votre application avec ses différentes sections&nbsp;:

1. Informations&nbsp;;
2. Boutons d'action (plein écran, intégration sur un site, capture...)&nbsp;;
3. Menu de configuration&nbsp;;
4. Aperçu.

![Page de configuration](./images/user-guide-backoffice/infos-parcelles-config.jpg)

Le titre de la visualisation peut être modifié.  
Les **informations** vous donnent un résumé des caractéristiques de votre application.  
Les boutons d'action vous permettent d'importer l'application sur un autre site, de dupliquer l'application, de la supprimer et d'accéder à l'application en plein écran.

## Menu de configuration
Le menu de configuration est composé de trois sous-menus&nbsp;: **sources de données**, **options de rendu** et **navigation**.

### 1. Sources des données  

Dans le menu **sources de données**, choisissez le jeu de données que vous venez de préparer avec les concepts.

**Remarque**&nbsp;: Si votre fichier n'est pas disponible dans ce menu, vérifiez que vous avez bien mis à jour les [concepts](./user-guide-backoffice/concept) **code parcelle**, **latitude** et **longitude** dans votre jeu de données.

Lorsque vous avez choisi un jeu de données compatible avec l'application **infos parcelles**, votre aperçu de carte s'affiche avec les points de vos données.  
Pour le moment, les points sont tous de la même couleur et vous n'avez que les données cadastrales par défaut.  

### 2. Options de rendu  

Dans le menu **options de rendu**, renseignez la colonne de votre légende avec le paramètre **couleur par valeur d'un champ**.  
Dans le paramètre **infobulle**, vous pouvez sélectionner plusieurs colonnes à afficher lorsque qu'un utilisateur de votre visualisation aura cliqué sur une parcelle.

### 3. Navigation  

Dans le menu **navigation**, vous pouvez cacher la barre de recherche et activer ou désactiver la géolocalisation.

Lorsqu'un aperçu vous satisfait, cliquez sur **enregistrer** pour finaliser votre configuration.  
Vous pouvez ajouter une description en bas de page et rendre publique votre application.  
Votre application est configurée et vous pouvez la consulter à l'aide des boutons **consultation** ou **plein écran**.
