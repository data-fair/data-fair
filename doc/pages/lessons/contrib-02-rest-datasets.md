---
title: Saisie des données par formulaire
section: 2
subsection: 2
description : Créer et mettre à jour un jeu de données éditable
published: true
---

## Créer son premier jeu éditable

Les jeux de données sont des jeux de données qui peuvent être modifiés sans avoir à recharger l'intégralité des données. Les modifications des données s'effectuent via une saisie par formulaire.

Nous allons créer notre premier jeu éditable à partir de la page d'accueil :

1. Cliquez sur *Créer un jeu de données*  
2. Choisissez **Editable**  
3. Renseignez un titre 
4. Vous pouvez laisser les différentes options avec leurs valeurs par défaut
5. Validez la création du jeu de données

Après une brève étape d'initialisation, vous arrivez sur l'écran d'édition du jeu de données. Dans la section schéma, il n'y a pour l'instant aucune colonne : contrairement à l'import par fichier, il va falloir créer le schéma du jeu de données et saisir les différentes colonnes.

![No colupmns rest dataset](./images/lessons/contrib-02-rest-datasets-01.jpg)  
*Jeu de données éditable sans colonnes*

Cliquez sur le bouton "+" dans le schéma pour ajouter votre première colonne.  
Renseignez la clé de votre colonne ainsi que le type de données que vous souhaitez lui associer.

![Edit column in rest dataset](./images/lessons/contrib-02-rest-datasets-02.jpg)  
*Clé et type de la colonne*

Ajoutez l'ensemble de vos colonnes et cliquer sur le bouton **Appliquer**.

![Rest dataset schema](./images/lessons/contrib-02-rest-datasets-03.jpg)  

Vous pouvez éventuellement définir une clé primaire : cela permet notamment de mettre à jour plusieurs ligne du jeu de données d'un coup avec un fichier. Pour chaque ligne du fichier, si la combinaison des valeurs des colonnes de la clé primaire correspond à une ligne existante du jeu de données, une nouvelle ligne ne sera pas créée et la ligne correspondante sera mise à jour.

## Ajouter, modifier et supprimer des lignes

Dans la section **Données** vous avez le tableau de vos données, celui-ci est vide pour le moment.  
Cliquez sur le bouton "+" de cette section pour ajouter une ligne.  
Le formulaire de saisie de votre jeu données apparait.  

![Rest dataset form](./images/lessons/contrib-02-rest-datasets-04.jpg)  
*Vous pouvez ajouter 1 ligne à votre jeu de données avec cette méthode* 

Une fois la ligne ajoutée, une animation vous signale que la plateforme est entrain d'intégrer la modification. Vous n'être pas obligé d'attendre que l'animation disparaisse pour saisir une autre ligne de données.

Nous allons maintenant modifier la ligne que nous venons de créer. Cliquer sur l'icone crayon : un formaulaire déjà rempli avec les données que vous aviez saisies apparaît. Modifiez les données et valider.

Vous pouvez enfin supprimer la ligne que vous venez de créer avec l'icone de corbeille. Pour éviter les suppression par erreur, une modale de confirmation vous demandera de valider cette suppression.

## Ajouter ou mettre à jour plusieurs lignes avec un fichier

La saisie par formulaire permet de modifier les lignes une par une. Mais il est parfois intéressant de pouvoir mettre à jour plusieurs lignes en même temps. Pour cela il faut utiliser un fichier au format CSV et avec un encodage UTF-8 et ayant exactement les même colonnes que votre jeu éditable. C'est ce format de fichier que vous obtenez quand vous téléchargez les données depuis la vue tableau avec le format CSV.

Téléchargez les données, et éditez le fichier avec votre tableur. Nous vous invitons à utiliser Libre Office qui permet de traiter le format CSV plus simplement qu'Excel. Supprimez les lignes et ajoutez en de nouvelles, ou modifiez toutes les lignes existantes. Lors de la sauvegarde du fichier, veillez à bien conserver le format CSV avec un séparateur virgule et un encodage UTF-8.

Importez votre fichier en utilisant l'icône avec une flèche montant à coté de l'icône "+". 

## Paramètres avancés

Lorsque vous créez un jeu de données éditable, vous pouvez initier le schéma à l'aide d'un jeu de données existant sur la plateforme.  
Le schéma de ce jeu de données va être recopié dans votre jeu de données éditable, mais les données ne seront pas copiées.  

Créez un autre jeu éditable de cette manière, et activez dans les options la conservation de l'historique des révisions des lignes.

Saisissez une ligne de données, puis mettez la à jour. Faites une 2e modification dans d'autres champs. Vous pouvez maintenant visualiser les modifications réalisées sur chacune des lignes avec l'icône d'horloge.

![Rest dataset history](./images/lessons/contrib-02-rest-datasets-05.jpg)  

Il est également possible de configurer des délais d'expiration des lignes : au bout d'un moment, les lignes seront supprimées. Les délais d'expirations peuvent être paramétrés pour les lignes de données et pour l'historique des révisions.
