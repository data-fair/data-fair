---
title: Traitements périodiques
section: 14
updated: 2021-09-20
description : Automatisation de vos données à l'aide des traitements périodiques
published: true
---

Les **traitements périodiques** vont chercher des données à certains endroits, les transforment et les publient sur la plateforme.  
Ils peuvent ainsi être utilisé pour la **mise à jour automatique de données** à intervalle régulières.

Les traitements périodiques se différencient des connecteurs de [catalogues](./user-guide-backoffice/catalogues) sur plusieurs points :

* Un traitement est limité à un ensemble réduit de sources en entrée et en sortie. Typiquement, il peut récupérer des données à un endroit, les métadonnées à un autre, et déverser les données dans une source de Data&nbsp;Fair.
* Les **fréquences de collecte peuvent être plus élevées** : on peut collecter les données avec quelques secondes d’intervalle, ce qui est adapté à la publication des données IOT.
* Les traitements périodiques ne peuvent être configurés que par un administrateur de la plateforme. Veuillez [nous contacter](https://koumoul.com/contact) si vous êtes intéressé par un traitement périodique.  

![Traitements périodiques](./images/user-guide-backoffice/processings.jpg)  
*Collectez, transformez et publiez vos données automatiquement*


Un traitement périodique comporte plusieurs éléments de paramétrage :

* Actif ou non actif
* Le pas de temps : Mensuel, hebdomadaire, journalier ou horaire
* L'action : Création d'un jeu de données ou Mise à jour d'un jeu de données existant
* Paramètres: permettent, par exemple, de supprimer les données téléchargées utilisées pour le traitement périodique
<p> </p>
L'historique des exécutions est disponible et les erreurs sont remontées dans ce journal.

![Traitements périodiques](./images/user-guide-backoffice/processings-2.jpg)  
