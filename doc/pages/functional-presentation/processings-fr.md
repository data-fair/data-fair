---
title: Traitements périodiques
section: 3
subsection : 5
description : Traitements périodiques
published: true
---

Les traitements périodiques vont **chercher** des données à certains endroits, les **transforment** et les **importent** sur la plateforme. Il sont réalisés sous la forme de plugins open source, ce qui veut dire que la liste des traitements possibles est extensible.

Le plugin *dfp-dl-file* permet de couvrir plusieurs cas d'usage : ce traitement va chercher des fichiers à un endroit pour les publier sur la plateforme. Il est capable d'accéder à des fichiers via les protocoles **ftp, sftp ou http(s)**. Il fonctionne en général à la suite de traitements sur les données réalisés par des ETL qui mettent leur résultats sous la forme de fichiers accessibles à distance.

Chaque plugin à son propre paramétrage (code d'accès, jeu de données à mettre à jour, ...) mais tous les traitements ont les mêmes options de planification. Les traitements peuvent être déclenchés toutes les heures, jours, semaines, mois ou être paramétrés pour être déclenchés manuellement.

Il est même possible de générer une clé d'API spécifique au traitement pour créer un **webhook permettant de le déclencher** : un traitement dans un ETL peut par exemple créer un fichier sur un espace de partage puis appeler l'url du webhook pour que le traitement d'import se déclenche.


![Collecteurs](./images/functional-presentation/collecteurs.jpg)

Un contributeur peut accéder à l’**état de réussite** des différentes exécutions d'un traitement, ainsi que d’accéder à des logs détaillés de ces exécutions. Il peut s'abonner aux notifications d'un traitement pour être informé quand un traitement est en échec, ou que des alertes sont renvoyées dans les logs.