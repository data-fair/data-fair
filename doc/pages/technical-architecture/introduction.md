---
title: Introduction
section: 1
updated: 2020-12-09
description : Introduction
published: true
---

L'architecture technique retenue est une plateforme composée de différents services web. La plupart de ces services sont open&nbsp;source et décrits ici, mais certaines extensions peuvent être disponibles sous la forme de services distants propriétaires&nbsp;:

* **Data&nbsp;Fair**, le coeur de la solution&nbsp;: indexer, &laquo;&nbsp;Apifier&nbsp;&raquo;, enrichir et partager facilement ses données&nbsp;;
* **Simple directory**&nbsp;: se connecter au portail et gérer les comptes&nbsp;;
* **Data&nbsp;Fair Portal**&nbsp;: créer facilement plusieurs portails de données, pour du partage en open&nbsp;data ou en interne&nbsp;;
* Les **connecteurs de catalogues**&nbsp;: se synchroniser avec d'autres catalogues de données, dans les deux sens&nbsp;;
* **Data&nbsp;Fair Processings**&nbsp;: programmer des traitements périodiques pour mettre à jour les données et récolter les données issues de l’IOT&nbsp;;
* **Notify**&nbsp;: gérer les alertes et les notifications&nbsp;;
* Les **analytics**&nbsp;: peuvent être gérés directement dans la plateforme à l'aide de Matomo&nbsp;;
* **Capture**&nbsp;: créer les miniatures et les captures d’images des visualisations&nbsp;;
* **Thumbor**&nbsp;: permet les traitement des images des jeux de données&nbsp;;
* **Backup**&nbsp;: gérer les sauvegardes de la plateforme&nbsp;;
* Les **services distants** ne sont pas développés dans ce projet&nbsp;: ce sont des applications web développées et déployées de manière autonome qui respectent les règles d’interopérabilité d’OpenAPI 3.0 avec Data&nbsp;Fair. Ils sont disponibles sous forme d'extensions&nbsp;;
* Les **visualisations de données**&nbsp;: certaines sont open source, d'autres propriétaires (extensions en libre accès ou nécessitant un abonnement). Chaque application de base peut être utilisée autant de fois que désiré pour valoriser différents **jeux de données**. Data&nbsp;Fair permet de stocker et éditer les différents paramètres d'une même application de base.

## Architecture technique complète

![Catalogue de données](./images/technical-architecture/architecture.jpg)

## Authentification

Le mécanisme d'authentification utilisé pour sécuriser les API des différents service est le JWT (JSON Web Token). La sécurité repose sur des mécanismes de cryptograhie asymétrique (RSA). La session utilisateur est maintenue côté client, ce qui permet d'avoir un back-end sans état, et donc *scalable*. Le back-end n'émet pas de JWT&nbsp;: il doit donc être relié à un annuaire [simple directory](https://koumoul-dev.github.io/simple-directory/) qui en émet. Le lien vers cet annuaire permet de télécharger sa clé publique pour ensuite vérifier que les JWT reçus sont valides.


## Déploiement

Les différents services sont livrés avec [Docker](https://www.docker.com/). Nous recommandons de les déployer et de les opérer dans un environnement tel que Kubernetes.

Il est possible de déployer ces différents services à l'aide de Docker&nbsp;Compose également. Cela permet de démarrer plus rapidement et est particulièrement adapté pour un déploiement en local pour tester la plateforme ou développer des extensions pour celle-ci.

Pour plus de détails, vous pouvez consulter la [documentation d'installation](install/install).

## Licences

Les différents services sont **open&nbsp;source**, avec comme licence l'AGPL v3, qui est une licence copyleft&nbsp;: tous ceux mettant le service à disposition d'autres utilisateurs doivent partager les éventuelles améliorations qu'ils y apporteraient. Nous avons choisi de rendre ces services open&nbsp;source pour deux raisons&nbsp;: pour partager des données **open&nbsp;data**, il nous paraît naturel d'utiliser un service open&nbsp;source, et quel que soit le type de données, l'ouverture du code offre des garanties de sécurité et de pérennité qui permet aux organisations de déployer ces services sur leurs propres serveurs en toute sérénité.
