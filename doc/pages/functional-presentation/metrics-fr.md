---
title: Métriques d’utilisation
section: 3
subsection : 7
description : Métriques d’utilisation
published: true
---

Il y a deux modules pour suivre l'utilisation de la plateforme. Le premier est les **analytics** et correspond au suivi des parcours des utilisateurs sur le portail de données. Cela permet de voir quelles pages sont consultées, d'ou viennent les utilisateurs, le temps qu'il passent sur les pages, ... Le second correspond à des **mesures de consommation des APIs** et permet de voir comment la plateforme est utilisée par les autres systèmes d'informations ou les sites externes.

## Analytics

Il est possible d'utiliser **Matomo Analytics** (anciennement Piwik) ou **Google Analytics** comme système de suivi. Cela se fait simplement par configuration du portail de données en renseignant quelques champs dans un formaulaire.

### Matomo Analytics

La configuration se fait avec l'*url du tracker* et l'*identifiant de votre site*. Les statistiques sous [Matomo Analytics](https://fr.matomo.org/) sont disponibles sous différentes formes : tableaux, graphiques et cartes. En sélectionnant les différentes représentations des statistiques, il est possible de  personnaliser ses tableaux de bord. Il est également possible d'**anonymiser les données** et d’enregistrer les parcours utilisateurs tout en étant en conformité avec les recommandations de la [CNIL](https://www.cnil.fr/professionnel).

<img src="./images/functional-presentation/matomo.jpg"
     height="300" style="margin:40px auto;"alt="capture d'écran de Matomo" />

### Google Analytics

La configuration se fait grâce au *numero d'identifiant*. Les statistiques sous [Google Analytics](https://analytics.google.com/) sont aussi disponibles sous différentes formes : tableaux, graphiques et cartes. Il est aussi possible de personnaliser ses tableaux de bord.

<img src="./images/functional-presentation/google-analytics.jpg"
     height="300" style="margin:40px auto;" alt="capture d'écran de Google analytics" />


## Utilisation des APIs

Dans la mesure ou Data Fair et les différents services associés utilisent beaucoup les mécanismes de cache pour améliorer les temps d'accès aux ressources, les statistiques précises d'utilisation des différents points d'accès de la plateforme ne peuvent être collectées que par un service spécifique associé au reverse-proxy de la plateforme.

Dans un souci de **respect du RGPD**, les données collectées sont anonymisées et agrégées à la journée. On peut accéder à des statistiques pour chaque jeu de données : **nombre d'appels d'API et nombre de téléchargements**. Les métriques sont aggrégées par groupes d'utilisateurs (organisation propriétaire, utilisateurs authentifiés externes, anonymes, ...) ou par domaine d'appel. Des chiffres clés sont présentés sur la période demandée, avec une comparaison sur la période précédente, ce qui permet de voir si l'utilisation de certaines données augmente ou diminue.

<img src="./images/functional-presentation/metrics.jpg"
     height="500" style="margin:40px auto;" alt="capture d'écran du dashboard des métriques de consommation d'API" />