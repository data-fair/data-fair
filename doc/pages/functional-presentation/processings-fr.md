---
title: Traitements périodiques
section: 3
subsection : 5
description : Traitements périodiques
published: true
---

Les traitements périodiques vont **chercher** des données à certains endroits, les **transforment** et les **importent** sur la plateforme. Il sont réalisés sous la forme de plugins open&nbsp;source, et la liste des traitements disponibles est en évolution constante.

Par exemple, le plugin *download-file*, qui est assez générique, permet de couvrir plusieurs cas d'usage&nbsp;: ce traitement va chercher des fichiers à un endroit pour les publier sur la plateforme. Il est capable d'accéder à des fichiers via les protocoles **FTP, SFTP ou HTTP(S)**. Il fonctionne en général à la suite de traitements sur les données réalisés par des ETL qui déposent leurs résultats sous la forme de fichiers accessibles à distance.

Chaque plugin a son propre paramétrage (code d'accès, jeu de données à mettre à jour...), mais tous les traitements ont les mêmes options de planification. Les traitements peuvent être déclenchés toutes les heures, jours, semaines, mois ou être paramétrés pour être déclenchés manuellement.

Il est possible de générer une clé d'API spécifique au traitement pour créer un **webhook permettant de le déclencher**&nbsp;: un traitement dans un ETL peut, par exemple, créer un fichier sur un espace de partage puis appeler l'URL du webhook pour que le traitement d'import se déclenche.


![Collecteurs](./images/functional-presentation/collecteurs.jpg)

Un contributeur peut accéder à l’**état de réussite** des différentes exécutions d'un traitement, ainsi qu'aux logs détaillés de ses exécutions. Il peut s'abonner aux notifications d'un traitement pour être informé quand un traitement est en échec ou que des alertes sont présentes dans les logs.