---
title: Choisir la configuration d'authentification de votre portail
section: 11
subsection : 5
updated: 2023-01-05
description : Plusieurs méthodes sont disponibles pour vous connecter à votre portail
published: true
---

La configuration d'authentification de vos portails est une configuration technique qui nécessite d'être super&nbsp;administrateur.

Nous décrivons ici les différents types de configuration d'authentification dont vous pouvez disposer et nous vous invitons à contacter un super&nbsp;administrateur une fois votre choix fait.

Le compte avec lequel vous pouvez vous connecter sur le portail peut être un compte créé sur koumoul.com (back-office), sur le portail en lui même ou sur un service d'authentification de session (SSO).

### Uniquement sur koumoul.com

Avec la configuration **uniquement sur koumoul.com**, les comptes créés sur le portail seront créés sur koumoul.com.  
Toute personne ayant créé un compte sur koumoul.com pourra s'authentifier sur votre portail et visualiser les données du propriétaire du portail qui lui auront été ouvertes.

Par exemple, si vous avez ouvert des droits au compte X sur un jeu de données sur koumoul.com, il pourra visualiser le jeu de données en se connectant sur votre portail.  
Si aucun droit n'a été donné au compte X, celui-ci ne pourra pas accéder à vos données privées.

Il s'agit de la configuration que vous pouvez trouver sur notre site [opendata.koumoul.com](https://opendata.koumoul.com/).  

![PJ-1](./images/user-guide-backoffice/authetication-1.png)  
*Les visiteurs de votre portail se connectent comme sur koumoul.com*

Avec votre compte créé sur [opendata.koumoul.com](https://opendata.koumoul.com/), vous pouvez vous authentifier sur tous les portails Koumoul qui ont une configuration incluant l'authentification sur koumoul.com.

### Uniquement le site lui-même

Avec la configuration **uniquement le site lui-même**, les comptes ne pourront être utilisés que sur le portail sur lequel ils auront été créés.  

Pour donner des droits d'accès à vos données privées, vous devez disposer de l'adresse e-mail utilisée pour créer le compte sur votre portail.  
Vous pourrez ainsi soit inviter la personne dans votre organisation et lui donner accès à toutes les données privées selon le rôle attribué, soit lui donner un droit d'accès sur un jeu de données spécifique.

### Sur le site et sur koumoul.com par SSO

Avec la configuration **sur le site et sur koumoul.com**, les comptes peuvent être créés soit sur le site, soit sur koumoul.com.

![PJ-2](./images/user-guide-backoffice/authetication-2.png)  
*Les visiteurs de votre portail peuvent se connecter avec koumoul.com*

Par exemple, sur la mire d'authentification de l'image ci-dessus, les visiteurs peuvent se connecter à l'aide du bouton *koumoul.com* s'ils possèdent un compte Koumoul, ou directement sur le portail avec leur e-mail et leur mot de passe du portail.

Vous pourrez donner des droits d'accès à vos données privées selon le site sur lequel a été créé le compte.

### Ajout d'un site SSO

Il est possible d'ajouter un site d'authentification qui va être utilisé pour accéder à votre portail.

![PJ-3](./images/user-guide-backoffice/authetication-3.png)  
*Les visiteurs de votre portail peuvent se connecter à l'aide un compte externe*

Par exemple, sur la mire d'authentification de l'image ci-dessus, les visiteurs peuvent se connecter à l'aide du bouton *ademe*, s'ils possèdent un compte ADEME en interne.

### Utiliser un autre de vos sites

Il est possible de créer plusieurs portails à l'aide de la plateforme koumoul.com.
Avec la configuration **utiliser un autre de vos sites**, vous pouvez utiliser un autre portail créé sur koumoul.com comme passerelle d'authentification.

Par exemple, vous pouvez avoir un portail open&nbsp;data parent et plusieurs portails en interne configurés avec l'option **utiliser un autre de vos sites**.  
Lorsqu'une personne essaie de se connecter sur un portail interne, elle sera automatiquement redirigée sur votre portail open&nbsp;data parent pour se connecter puis sera automatiquement redirigée vers le site interne une fois la connexion réussie.  
Ainsi, vous pouvez avoir un seul site d'authentification et plusieurs sites internes qui utiliseront la mire d'authentification du site parent.
