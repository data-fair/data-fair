---
title: Présentation
permalink: /overview
---

Ce service permet d'enrichir et de partager facilement ses données pour pouvoir ensuite les utiliser dans des applications. Le partage des données peut se faire en mode privé (private-data) ou public (open-data). Pour l'instant, les données partageables sont des données de type tabulaire, mais le service devrait bientôt supporter d'autres formats, comme les données géographiques. Ce service permet de mettre facilement des données à disposition, mais les métadonnées sont minimes et **ce n'est donc pas un service de catalogage**. Il peut donc être un excellent complément à un service comme [udata](https://github.com/opendatateam/udata) utilisé sur le site [data.gouv.fr](http://data.gouv.fr).

Ce service permet d'exposer facilement ses données via une API web, **contractualisée et documentée**, ce qui permet aux développeurs de les **réutiliser facilement dans leurs applications**. De plus les données peuvent être **sémantisées, ce qui permet ensuite de les enrichir** avec d'autres données sémantisées. Ainsi, des données qui ont une adresse peuvent par exemple être complétées par des coordonnées GPS, ce qui permet ensuite de les afficher sur une carte. Mais bien qu'il puisse être utilisé pour de l'enrichissement, ce service **n'est pas un atelier de traitement de la donnée**. Il est plutôt complémentaire et permet de publier de la donnée prétraitée.

## Concepts clés

Ce service tourne autour de 3 concepts : les jeux de données, les services externes et les applications. La finalité de ce service est de pouvoir faire tourner des applications utilisables facilement dans différents métier en choisissant avec quelles données elles sont alimentées.
<!-- Ces applications ont besoin de carburant pour pouvoir fonctionner correctement. Le carburant est les différentes données provenant des jeux de données et des APIs externes. On parle des données comme l'or noir du 21e siècle : ce service permet de raffiner ces données pour en faire le meilleur carburant possible. -->

Les jeux de données sont créés par les utilisateurs en chargeant des fichiers : le service stocke le fichier, l'analyse et déduit un schéma de données. Les données sont ensuite indexée suivant ce schéma et peuvent être requêtée au travers d'une API Rest. L'utilisateur peut **sémantiser les champs des jeux de données**, par exemple en déterminant qu'une colonne contenant des données sur 5 chiffre est un champ de type Code Postal. Cette sémantisation permet 2 choses : les données peuvent être enrichies et servir à certains traitements si on dispose des services externes appropriés, et les données peuvent être utilisées dans les applications qui manipulent les concepts qu'elles contiennent.

Les services externes mettent à disposition des fonctionnalités sous forme d'APIs Web, qui peuvent être ouvertes ou fermées. Ce service permet de stocker des informations d'accès comme des clés. Ce service **permet donc à des non informaticiens de pouvoir utiliser facilement des APIs externes avec leurs propres données**. Ils peuvent par exemple enrichir leurs données avec des données fraîches.

Les applications permettent d'exploiter au maximum le potentiel des données. Des données contenant un champ de code de commune peuvent par exemple être projetées sur une carte vectorielle avec des zones colorées (par exemple des résultats d'élections), des données contenant un code parcelle peuvent être directement projetées sur le cadastre, ... **Les applications ne sont pas développées dans ce projet** : ce sont des services externes.

## Contrôles d'accès

Le service permet de contrôler simplement mais de manière puissante les permissions sur les différentes ressources. Les utilisateurs peuvent faire partie de une ou plusieurs organisations, qui peuvent elles même contenir un ou plusieurs utilisateurs. Quand un utilisateur importe un jeux de données, une API externe ou configure une application, il peut déterminer quels utilisateurs et organisations y ont accès. Ouvrir un accès à une organisation donne l'accès à tous les membres de cette organisation. Les accès peuvent également être ouvert en public et même les personnes non authentifiées pourront alors accéder à la ressource.

Les **utilisateurs et organisations ne sont pas gérées dans ce service**. Ce service doit être connecté à un annuaire qui implémente le contrat du service [simple-directory](https://github.com/koumoul-dev/simple-directory).
