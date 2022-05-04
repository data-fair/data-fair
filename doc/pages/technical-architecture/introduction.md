---
title: Introduction
section: 1
updated: 2020-12-09
description : Introduction
published: true
---

L'architecture technique retenu est une plateforme composé de différents services Web. La plupart de ces services sont open source et décrits ici, mais certaines extensions peuvent être disponibles sous la forme de services distants propriétaires :

* **Data Fair**, le coeur de la solution, permet d’indexer, d’Apifier, d’enrichir et de partager facilement ses données
* **Simple Directory** permet de se connecter au portail et gérer les comptes
* **Data Fair Portal** permet de créer facilement plusieurs portails de données, pour du partage en opendata ou en interne
* Les **Connecteurs de catalogues** permettent de se synchroniser avec d'autres catalogues de données, dans les 2 sens
* Les **Data Fair Processings** permet de programmer des traitements périodiques pour mettre à jour les données et de récolter les données issues de l’IOT
* **Notify** permet de gérer les alertes et les notifications
* **Les analytics** peuvent être gérés directement dans la plateforme à l'aide de Matomo
* **Capture** permet de créer les miniatures et les captures d’images des visualisations
* **Thumbor** permet les traitement des images des jeux de données
* **Backup** permet de gérer les sauvegardes de la plateforme
* Les **services distants** ne sont pas développées dans ce projet : ce sont des applications Web développées et déployées de manière autonome qui respectent les règles d’interopérabilité d’OpenAPI 3.0 avec Data Fair. Ils sont disponibles sous forme d'extensions.
* Les **visualisations de données** : certaines sont open source, d'autres sont propriétaires (extensions en libre accès ou nécessitant un abonnement). Chaque application de base peut être utilisée autant de fois que désiré pour valoriser différents **jeux de données**. Data Fair permet de stocker et éditer les différents paramètres d'une même application de base.

### Architecture technique complète

![Catalogue de données](./images/technical-architecture/architecture.jpg)

### Authentification

Le mécanisme d'authentification utilisé pour sécuriser les APIs des différents service est le JWT (Json Web Token). La sécurité repose sur des mécanismes de cryptograhie asymétrique (RSA). La session utilisateur est maintenue coté client, ce qui permet d'avoir un backend sans état, et donc scalable. Le backend n'émet pas de JWT : il doit donc être relié à un annuaire [simple directory](https://koumoul-dev.github.io/simple-directory/) qui en émet. Le lien vers cet annuaire permet de télécharger sa clé publique pour ensuite vérifier que les JWT reçus soient valides.


### Déploiement

Les différents services sont livré avec [Docker](https://www.docker.com/). Nous recommandons de les déployer et de les opérer dans un environnement tel que Kubernetes.

Il est possible de déployer ces différents service à l'aide de docker-compose également. Cela permet de démarrer plus rapidement, et est particulièrement adapté pour un déploiement en local pour tester la plateforme ou développer des extensions pour celle-ci.

Pour plus de détails, vous pouvez consulter la [documentation d'installation](install/install).

### Licences

Les différents services sont *open source*, avec comme licence l'AGPL v3, qui est une licence copyleft : tous ceux mettant le service à disposition d'autres utilisateurs doivent partager les éventuelles améliorations qu'ils y apporteraient. Nous avons choisi de rendre ces services *open source* pour 2 raisons : pour partager des données *open data*, il nous paraît naturel d'utiliser un service *open source*, et quel que soit le type de données, l'ouverture du code offre des garanties de sécurité et de pérennité qui permet aux organisations de déployer ces services sur leurs propres serveurs en toute sérénité.
