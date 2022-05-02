---
title: Enrichir ses données
section: 4
subsection: 6
updated: 2021-09-20
description: Jointures de données
published: false
---

L'enrichissement permet d'importer des colonnes d'une base de référence. Il est ainsi possible de croiser ses données avec des données issues de l'open data telles que la base SIRENE, les données INSEE, le cadastre ou la BAN.

* La **base SIRENE** rassemble les informations économiques et juridiques de plus de 28 Millions d'établissements d'entreprises, dont plus de 11 Millions établissement actifs.
* Les **données INSEE** permettent de récupérer diverses informations sur les divisions administrative (communes, départements, régions)
* Le **cadastre** permet d'avoir accès aux différentes informations concernant les parcelles. Vous pouvez notamment géocoder des codes parcelles ou encore obtenir les surfaces de vos parcelles.
* La BAN est la **Base d'Adresse Nationale**. Elle permet de géolocaliser des adresses ou de trouver des adresses à partir de coordonnées.

En fonction des données que vous possédez, vous pouvez choisir l'enrichissement qui vous convient et compléter vos données.


## Créez vos données de référence

Pour le moment, seul les supers administrateurs de l'instance peuvent définir un jeu de données comme **Données de référence**.

1. Importer un fichier et associer au moins un concept à une colonne.
2. Passer en mode surper administrateur  
3. Définir votre données de référence

Une fois ces 3 étapes réalisées, il vous est alors possible d'enrichir d'autres données avec vos données de référence.

### Import et concept
Lorsque votre jeu de données est créé sur votre compte, il vous faudra associer un concept à la colonne qui va faire la jointure avec les autres jeux de données. Votre colonne devra contenir des codes uniques, tels que des **Codes INSEE** de commune, des **Codes SIRENE** ou des **Codes parcelles**

![Données de référence](./images/user-guide-backoffice/enrichment-concept.jpg)  
*Une colonne possédant un concept est en gras*

### Mode super administrateur

Le mode super administrateur n'est disponible que pour les utilisateurs autorisé dans l'instance.  
Ce mode est disponible dans le menu en haut à droite sur Data Fair.

![Données de référence](./images/user-guide-backoffice/enrichment-superadmin.jpg)


### Définir une donnée de référence

Le jeu de donnée importé avec ses concepts renseignés peut servir de donnée de référence pour des **recherches unitaires** ou/et pour des **enrichissements en masse**.  

Les **recherches unitaires** vont vous permettre de valider un code dans vos [jeux de données incrémentaux](./user-guide-backoffice/import-dataset).  
Si votre jeu de données éditable possède le même concept qu'un de vos jeux de données référence, lorsque qu'une valeur sera renseigné pour cette colonne, l'utilisateur aura des propositions valides de ce concept.

Les **enrichissements en masse** vont vous permettre de réaliser une jointure à froid et d'importer des colonnes du jeu de référence vers votre jeu de données.

![Données de référence](./images/user-guide-backoffice/enrichment-master-data.jpg)  
*Croisez vos données avec les données de référence*

Sur notre image, nous avons créé une donnée de référence SITADEL avec le concept **code parcelle** qui pourra être utilisé dans les enrichissements en masse.  
Tout autre jeu de données de votre compte possédant le concept **code parcelle** pourra utiliser l'enrichissement SITADEL pour importer diverses colonnes de la base de référence SITADEL.

### Créer un concept

Vous pouvez créer vos propres concepts de valeurs uniques dans la section **Vocabulaire privé** de **Paramètres** de votre compte. Les concepts créés dans cette section ne seront disponible que pour votre compte (organisation ou personnel). Ces concepts pourront être utilisés dans vos données de référence.  

Un concept est défini par son **Identifiant**, son **Titre**, sa **Description** et sa **Catégorie**. L'identifiant et le titre sont obligatoires.

![Données de référence](./images/user-guide-backoffice/enrichment-vocabulaire.jpg)  
*Créez vos propres concepts*
