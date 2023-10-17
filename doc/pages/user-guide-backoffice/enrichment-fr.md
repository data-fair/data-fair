---
title: Enrichir ses données
section: 4
subsection: 6
updated: 2021-09-20
description: Jointures de données
published: true
---

L'enrichissement permet d'importer des colonnes d'une base de référence. Il est ainsi possible de croiser ses données avec des données issues de l'open&nbsp;data telles que la base Sirene, les données INSEE, le cadastre ou la BAN.

* La **base Sirene** rassemble les informations économiques et juridiques de plus de 28&nbsp;millions d'établissements d'entreprises, dont plus de 11&nbsp;millions d'établissement actifs.
* Les **données INSEE** permettent de récupérer diverses informations sur les divisions administratives (communes, départements, régions).
* Le **cadastre** permet d'avoir accès aux différentes informations concernant les parcelles. Vous pouvez notamment géocoder des codes parcelles ou encore obtenir les surfaces de vos parcelles.
* La BAN est la **Base Adresse Nationale**. Elle permet de géolocaliser des adresses ou de trouver des adresses à partir de coordonnées.

En fonction des données que vous possédez, vous pouvez choisir l'enrichissement qui vous convient et compléter vos données.


## Créez vos données de référence

Pour le moment, seul les super&nbsp;administrateurs de l'instance peuvent définir un jeu de données comme **données de référence**.

1. Importer un fichier et associer au moins un concept à une colonne&nbsp;;
2. Passer en mode super&nbsp;administrateur&nbsp;;  
3. Définir votre données de référence.

Une fois ces trois étapes réalisées, il vous est alors possible d'enrichir d'autres données avec vos données de référence.

### Import et concept
Lorsque votre jeu de données est créé sur votre compte, il vous faut associer un concept à la colonne qui va faire la jointure avec les autres jeux de données. Votre colonne devra contenir des codes uniques, tels que des **codes INSEE** de commune, des **codes Sirene** ou des **codes parcelles**.

![Données de référence](./images/user-guide-backoffice/enrichment-concept.jpg)  
*Une colonne possédant un concept est en gras*

### Mode super&nbsp;administrateur

Le mode super&nbsp;administrateur n'est disponible que pour les utilisateurs autorisés dans l'instance.  
Ce mode est disponible dans le menu en haut à droite sur Data&nbsp;Fair.

![Données de référence](./images/user-guide-backoffice/enrichment-superadmin.jpg)


### Définir une donnée de référence

Le jeu de données importé avec ses concepts renseignés peut servir de donnée de référence pour des **recherches unitaires** ou/et pour des **enrichissements en masse**.  

Les **recherches unitaires** vont vous permettre de valider un code dans vos [jeux de données incrémentaux](./user-guide-backoffice/import-dataset).  
Si votre jeu de données éditable possède le même concept qu'un de vos jeux de données référence, lorsque qu'une valeur sera renseigné pour cette colonne, l'utilisateur aura des propositions valides de ce concept.

Les **enrichissements en masse** vont vous permettre de réaliser une jointure à froid et d'importer des colonnes du jeu de référence vers votre jeu de données.

![Données de référence](./images/user-guide-backoffice/enrichment-master-data.jpg)  
*Croisez vos données avec les données de référence*

Sur notre image, nous avons créé une donnée de référence SITADEL avec le concept **code parcelle** qui pourra être utilisé dans les enrichissements en masse.  
Tout autre jeu de données de votre compte possédant le concept **code parcelle** pourra utiliser l'enrichissement SITADEL pour importer diverses colonnes de la base de référence SITADEL.

### Créer un concept

Vous pouvez créer vos propres concepts de valeurs uniques dans la section **Vocabulaire privé** de **Paramètres** de votre compte. Les concepts créés dans cette section ne seront disponibles que pour votre compte (organisation ou personnel). Ces concepts pourront être utilisés dans vos données de référence.  

Un concept est défini par son **identifiant**, son **titre**, sa **description** et sa **catégorie**. L'identifiant et le titre sont obligatoires.

![Données de référence](./images/user-guide-backoffice/enrichment-vocabulaire.jpg)  
*Créez vos propres concepts*
