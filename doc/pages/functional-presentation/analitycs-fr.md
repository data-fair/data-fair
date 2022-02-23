---
title: Analytics du portail
section: 3
subsection : 12
updated: 2020-12-09
description : Statistiques d’utilisation du portail
published: true
---

Ce module permet de comptabiliser les différentes statistiques de fréquentation de la plateforme.  
Il est possible d'utiliser **Matomo Analytics** (ancienne piwik) ou **Google Analytics** comme système de suivi.

### Matomo Analytics
Les statistiques sous [Matomo Analytics](https://fr.matomo.org/) sont disponibles sous différentes formes : tableaux, graphiques et cartes. En sélectionnant les différentes représentations des statistiques, il est possible de personnaliser ses tableaux de bord.  
Il est également possible d'**anonymiser les données** et d’enregistrer les parcours utilisateurs tout en étant en conformité avec les recommandations de la [CNIL](https://www.cnil.fr/professionnel).

![Matomo](./images/functional-presentation/matomo.jpg)

Il est possible de traiter des données personnelles en activant les fonctionnalités suivantes :
* **Droit d'accès** : les visiteurs peuvent avoir accès à leurs données personnelles
* **Droit à la portabilité** : les données des visiteurs peuvent être récupérées dans un format lisible par une machine
* **Droit à l'oubli** : respect de la vie privée des utilisateurs en supprimant leurs données personnelles
* **Droit de retirer son consentement** : les visiteurs peuvent revenir sur le consentement qu'ils ont accordé à n'importe quel moment
* **Droit d’opposition** : les visiteurs peuvent facilement choisir de ne plus être suivis
* **Fonctionnalités d'anonymisation** : en un clic, il est possible d'anonymiser les données personnelles comme les adresses IP, la localisation et bien d'autres
* **Support de la fonctionnalité "Ne pas pister" des navigateurs** : utilisation des réglages du navigateur web concernant les paramètres relatifs à la vie privée
* **Suppression des données historisées** : ces données sont supprimées automatiquement de la base de données
* **Anonymisation des données historisées** : on peut garder ces données en les anonymisant.

### Google Analytics

Les statistiques sous [Google Analytics](https://analytics.google.com/) sont aussi disponibles sous différentes formes : tableaux, graphiques et cartes. Il est aussi possible de personnaliser ses tableaux de bord.

![Google Analytics](./images/functional-presentation/google-analytics.jpg)

### Configuration

La configuration du système de suivi des utilisateurs se compose en deux points.  
1. Configuration du système de suivi sur le portail  
2. Configuration des événements

<p>
</p>

**Configuration du système de suivi sur le portail**

Ce point de configuration est disponible sur la configuration du portail.
Pour **Google Analytics** vous aurez besoin du *numero d'identifiant* et pour **Matomo analytics**, vous aurez besoin de l'*url du tracker* et de l'*identifiant de votre site*.

![Configuration](./images/functional-presentation/config-GA-1.jpg)


**Configuration des événements**
Ce point de configuration est disponible dans les paramètres de Data Fair à la catégorie *Appels exterieurs (webhooks)*.

Vous pouvez définir **quels événements** vous souhaitez suivre dans vos analytics :
* Un nouveau jeu de données a été créé
* Un jeu de données a rencontré une erreur
* Un jeu de données a été finalisé et mis en ligne
* Un jeu de données a été publié sur un catalogue
* Un jeu de données a été téléchargé dans un format fichier
* Une nouvelle réutilisation a été créée
* Une réutilisation a rencontré une erreur
* Une réutilisation a été publiée sur un catalogue
* Le fichier d'un jeu de données a été mis à jour
* Un extrait filtré d'un jeu de données a été téléchargé dans un format fichier

![Configuration](./images/functional-presentation/config-GA-2.jpg)
