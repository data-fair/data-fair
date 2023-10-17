---
title: Webhooks
section: 12
subsection: 3
updated: 2021-09-20
description : Rester informés de la vie de ses données
published: true
---

Les **webhooks** permettent de synchroniser des systèmes informatiques. On peut ainsi obtenir des messages lors de mises à jour ou d'ajouts de données, par exemple.

Liste d'événements déclencheurs&nbsp;:

* Création d'un jeu de données&nbsp;;
* Erreurs sur un jeu de données&nbsp;;
* Finalisation d'un jeu de données&nbsp;;
* Publication d'un jeu de données sur un catalogue&nbsp;;
* Téléchargement d'un jeu de données&nbsp;;
* Création d'un visualisation&nbsp;;
* Erreur sur une visualisation&nbsp;;
* Publication d'une visualisation sur un catalogue.

## Configurer le suivi d'événements pour Google Analytics

Pour configurer le suivi d'événements pour Google Analytics, il vous faudra posséder un [compte Google Analytics](https://support.google.com/analytics/answer/1008015?hl=fr) avec une propriété configurée et un numéro UA-XXXXXXXX-X configuré pour votre site.

Une fois que vous avez configuré votre compte Google Analytics et que vous disposez de votre numéro UA-XXXXXXXX-X, vous pouvez l'utiliser sur la section **webhooks** de votre compte Data&nbsp;Fair.

Lorsque vous êtes sur la page des paramètres, vous pouvez ajouter des **appels extérieurs** à l'aide du bouton **+**.

Une fenêtre apparaît pour configurer votre appel.  
Renseignez le titre, les événements déclencheurs que vous souhaitez suivre parmi la liste, puis choisissez **Google Analytics** comme type de cible.  
Dans la section de l'identifiant du traqueur, entrez votre numéro UA-XXXXXXXX-X.

Une fois votre webhook validé, vous aurez un rendu comme celui-ci&nbsp;:

![webhook](./images/user-guide-backoffice/web-2-identifiant.jpg)  
*Webhook Koumoul pour Google Analytics configuré*

Si vous avez bien configuré vos appels, vous pourrez visualiser le nombre d'événements par type que les utilisateurs de votre portail ont réalisés dans la section **comportement** > **événements** > **principaux événements** de votre compte Google Analytics.

![webhook](./images/user-guide-backoffice/web-3-events.jpg)

Pour obtenir le détail des téléchargements, cliquez sur **action d'événement** pour le type d'événements **dataset**

![webhook](./images/user-guide-backoffice/web-4-liste-events.jpg)
