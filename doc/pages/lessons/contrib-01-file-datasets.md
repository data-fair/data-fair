---
title: Import de données avec un fichier
section: 2
subsection: 1
description : Créer et mettre à jour un jeu de données avec un fichier
published: true
---

## Prérequis

Pour réaliser ce tutoriel, vous devez disposer d'un fichier tabulaire. Ce fichier peut être aux formats CSV, XSLX ou ODS. Dans les deux derniers cas, seule la première feuille est prise en compte et la première ligne de données doit contenir les en-têtes de colonnes.

## Importer son premier jeu de données

La page d'accueil vous permet d'accéder aux parcours simplifiés pour créer, mettre à jour ou publier un jeu de données.

![File dataset](./images/lessons/contrib-01-file-datasets-01.jpg)  
*Créer un nouveau jeu de données*

Nous allons importer notre premier jeu de données&nbsp;:

1. Cliquez sur **créer un jeu de données**&nbsp;;  
2. Choisissez le format **fichier**&nbsp;;  
3. Sélectionnez le fichier que vous avez préparé&nbsp;;
4. Si le nom du fichier est adapté, vous pouvez cocher la case pour utiliser le nom du fichier en tant que titre, sinon renseignez un titre dans le champ correspondant&nbsp;;
5. Lancez l'import.

Le jeu de données va passer par plusieurs étapes. Une fois la finalisation terminée, vous pouvez accéder au jeu de données en mode brouillon.

![Draft mode](./images/lessons/contrib-01-file-datasets-02.jpg)  
*Mode bouillon de notre premier jeu de données*

Si le fichier ne contient pas beaucoup de lignes, le brouillon n'est pas disponible et vous avez fini d'importer votre premier jeu de données.

En mode brouillon, vous pouvez vérifier le schéma de votre jeu de données (le nombre de colonnes, le type des données...),  
ainsi qu'accéder aux cent premières lignes de votre jeu de données dans la section données.

Comme il n'est pas question de modifier les métadonnées dans ce tutoriel, vous pouvez valider le brouillon pour finir d'importer votre jeu de données.

Descendez dans la vue tableau de la section données et vérifiez que les données que vous voyez correspondent bien au contenu du fichier que vous avez chargé.


## Mise à jour d'un jeu de données

Modifiez le fichier que vous venez de charger&nbsp;: vous pouvez ajouter une ligne ou modifier des valeurs dans des cellules. N'ajoutez pas ou ne supprimez pas de colonnes, cette partie sera abordée plus tard.

La mise à jour d'un fichier peut être rapidement réalisée à partir de la page d'accueil&nbsp;:

1. Cliquez sur **mettre à jour un jeu de données**&nbsp;;  
2. Choisissez **remplacer un fichier**&nbsp;; 
3. Sélectionnez le fichier que vous venez de modifier&nbsp;;
4. Si vous n'avez pas modifié le nom du fichier, un jeu de données vous sera proposé. Sinon, choisissez le jeu de données dans la liste et lancez la mise à jour.

![Replace dataset](./images/lessons/contrib-01-file-datasets-03.jpg)  
*Sélectionnez le jeu de données à remplacer*

Une fois l'étape de finalisation terminée (et le brouillon validé si besoin), allez dans la section données et vérifiez dans la vue tableau que les données ont bien été mises à jour.

## Modifier le schéma d'un jeu de données

Modifiez encore une fois le fichier que vous venez de charger&nbsp;: vous pouvez renommer l'en-tête d'une colonne, supprimer une colonne ou en ajouter une (si votre jeu de données contient peu de lignes).

Répétez les étapes de la section précédente pour mettre le jeu de données à jour. Pendant le traitement du fichier, une comparaison sera faite avec le fichier précédemment chargé.

Suivant les modifications que vous avez effectuées, les colonnes supprimées apparaîtront en rouge sur le schéma, les colonnes ajoutées en vert. Si vous avez renommé une colonne, l'ancien nom sera en rouge et le nouveau en vert. Vous pouvez cliquer sur chacune des colonnes pour connaître la modification réalisée.

![Schema updated](./images/lessons/contrib-01-file-datasets-04.jpg)  
*Validez le brouillon si vous souhaitez réaliser les modifications*
