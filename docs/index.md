---
title: Accessible Data
layout: splash
header:
  overlay_color: "#0288d1"
  overlay_filter: "0.1"
  overlay_image: assets/images/rocket.png
  cta_label: "Télécharger"
  cta_url: "https://github.com/koumoul-dev/accessible-data/"
excerpt: Partagez et enrichissez facilement vos données pour pouvoir les utiliser dans des applications dédiées.
intro:
  - excerpt: "<h2>/!\\ Ce service et sa documentation sont en cours développement</h2>Ce service permet d'exposer facilement ses données via une API web, **contractualisée et documentée**, ce qui permet de les rendre **interopérables** et utilisables dans d'autres applications. Le partage des données peut se faire en mode privé ou public (opendata)."
feature_row:
  - image_path: assets/images/file.png
    alt: Données
    title: Importer ses propres données
    excerpt: "Les jeux de données sont créés en chargeant des fichiers. Ils sont stockés, analysés et un schéma de données est déduit. Les données sont ensuite indexées suivant ce schéma et peuvent être requêtées au travers d'une API Rest. Les champs du schéma peuvent être sémantisés, ce qui permet ensuite d'enrichir les données et de les réutiliser dans des applications dédiées."
  - image_path: assets/images/robot.png
    alt: "Services externes"
    title: "Intégrer des services externes"
    excerpt: "Les fonctionnalités de services externes peuvent être intégrées facilement. Le service stocke les informations d'accès et permet de réappliquer des permissions sur chaque fonctionnalité. On peut grâce à ce mécanisme enrichir facilement ses propres données avec d'autres données. Des non informaticiens peuvent utiliser facilement des APIs externes avec leurs propres données."
  - image_path: assets/images/smartphone.png
    alt: "Applications"
    title: "Configurer des applications"
    excerpt: "Les applications sont des services externes qui permettent d'exploiter au maximum le potentiel des données. Grâce à la sémantisation, on peut déterminer les applications les plus appropriées aux données que l'on manipule. Il ne reste alors plus qu'à les configurer pour pouvoir les utiliser."
---
{% include feature_row id="intro" type="center" %}

{% include feature_row %}
