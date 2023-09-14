---
title: Configurer vos analytics
section: 11
subsection : 3
updated: 2021-11-09
description : Configurer le système de suivi de votre portail
published: true
---

La configuration du système de suivi des utilisateurs se compose en deux points&nbsp;:
1. Le choix du système de suivi sur le portail&nbsp;;
2. Configuration des événements.
<p>
</p>

Vous pouvez choisir entre trois différents systèmes de suivi, **Matomo**, **Google Analytics Universal Analytics (ancienne version de GA)** et **Google Analytics 4 (nouvelle version de GA)**.

## Configuration avec Matomo

Pour configurer votre portail pour qu'il envoie les données de suivi à Matomo, vous aurez besoin de l'**URL du tracker** et de l'**identifiant de votre site** configuré dans Matomo. Vous pourrez ensuite renseigner ces codes sur la configuration de votre portail.

## Configuration avec l'ancien système de suivi de Google Analytics (UA)

Pour Google Analytics Universal Analytics, vous aurez besoin de l'**ID de suivi** que vous pouvez retrouver après avoir créé votre propriété sur Google Analytics&nbsp;: **administration** > **paramètres de la propriété** > **ID de suivi**.  
L'identifiant de suivi est un code commençant par **UA-\***.

Vous pourrez ensuite renseigner ce code sur la configuration de votre portail.

![Configuration](./images/user-guide-backoffice/config-GA-1.jpg)

## Configuration avec le nouveau système de suivi de Google Analytics 4 G

Pour Google Analytics 4, vous aurez besoin de l'**ID de mesure** que vous pouvez retrouver après avoir créé votre propriété sur Google Analytics&nbsp;: **administration** > **paramètres de la propriété** > **flux de données** > Ajouter ou cliquez sur le flux de données > **ID de mesure**.  
L'identifiant de mesure est un code commençant par **G-\***.

Vous pourrez ensuite renseigner ce code sur la configuration de votre portail.

![Configuration](./images/user-guide-backoffice/config-GA4.jpg)

## Configuration des événements

Ce point de configuration est disponible dans les paramètres de Data&nbsp;Fair, à la catégorie **appels extérieurs (webhooks)**.

Vous pouvez définir quels événements suivre dans vos analytics&nbsp;:
* Un nouveau jeu de données a été créé&nbsp;;
* Un jeu de données a rencontré une erreur&nbsp;;
* Un jeu de données a été finalisé et mis en ligne&nbsp;;
* Un jeu de données a été publié sur un catalogue&nbsp;;
* Une nouvelle réutilisation a été créée&nbsp;;
* Une réutilisation a rencontré une erreur&nbsp;;
* Une réutilisation a été publiée sur un catalogue&nbsp;;
* Le fichier d'un jeu de données a été mis à jour.

![Configuration](./images/user-guide-backoffice/config-GA-2.jpg)
