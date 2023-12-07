---
title: Gestion de l'organisation
section: 10
subsection : 1
updated: 2021-09-20
description : Inviter les membres de votre organisation grâce à leur e-mail.
published: true
---

Lorsque vous êtes administrateur de votre organisation, la section **gestion de l'organisation** est accessible dans la barre de navigation de Data&nbsp;Fair.

Sur cette page, vous pouvez gérer les différents membres de votre organisation&nbsp;:
* **Inviter** de nouveaux membres par e-mail&nbsp;;
* **Changer le rôle** des membres&nbsp;;
* **Exclure** un membre.

![Membres](./images/user-guide-backoffice/orga-membres.jpg)  
*Gérez les membres de votre organisation*

Le changement de rôle et la suppression d'un membre peuvent être accomplis grâce aux boutons d'actions de la ligne du membre.

## Invitation

Pour inviter un membre dans votre organisation, vous n'avez besoin que de son adresse e-mail.

Lorsque vous cliquez sur le bouton + de la section des membres, la fenêtre d'invitation d'un membre apparaît.

Renseignez l'adresse e-mail de l'utilisateur, son rôle et le site de redirection.

Il existe 3 rôles dans une organisation : administrateur, contributeur et utilisateur. Les permissions de chaque rôle sont décrits dans la prochaine section de la page.

Le site de redirection permet de choisir le portail sur lequel vous souhaitez rediriger votre nouveau membre.
En validant le lien d'invitation, le membre que vous avez invité sera redirigé vers le portail choisi. Si vous ne possédez aucun portail, le site de redirection sera par défaut koumoul.com.  
Selon la [configuration d'authentification](./user-guide-backoffice/authentication-config) de votre portail que vous aurez choisi, le compte sera créé sur le site du portail ou sur le site koumoul.com

![Invitation](./images/user-guide-backoffice/orga-invitation.jpg)  
*Invitez les membres de votre organisation par e-mail*

Un e-mail d'invitation est envoyé sur l'adresse renseignée.  
Le message contient un lien pour créer son compte sur la plateforme et faire partie de votre organisation.  
Une fois connectée, la personne invitée aura accès aux différentes pages de l'organisation selon le rôle que vous lui aurez attribué.  


## Rôles

Une organisation permet de travailler à plusieurs sur différents jeux de données et visualisations.  

Les organisations suivent certaines règles&nbsp;:
* Tous les membres d'une organisation n'ont pas les même droits.  
* Les administrateurs d'une organisation peuvent modifier les rôles des différents membres de l'organisation.  
* Il existe trois rôles différents, utilisateur, contributeur et administrateur.  

<p>
</p>

Chaque rôle possède des permissions différentes.  

Permissions par défaut de Data&nbsp;Fair&nbsp;:

| Actions | Utilisateur | Contributeur | Administrateur |
| ----- | ---- | ---- | ---- |
| Ajout d'un jeu de données | | x | x |
| Lecture d'un jeu de données | x | x | x |
| Modification d'un jeu de données |  | x | x |
| Administration d'un jeu de données | |  | x |
| Ajout d'une visualisation | | x | x |
| Lecture d'une visualisation | x | x | x |
| Édition d'une visualisation |  | x | x |
| Administration d'une visualisation | |  | x |
| Accès et modification des paramètres de l'organisation|  |  | x |
| Création et modification du portail de l'organisation |  |  | x |


L'administration d'un jeu de données (ou une visualisation) consiste en la **suppression** et la **visibilité**.  
L'administrateur est le seul à pouvoir rendre public ou supprimer un jeu de données (ou une visualisation).  
L'utilisateur a simplement accès aux ressources privées de l'organisation.  

Les permissions pour chaque ressource peuvent être modifiées par les administrateurs de l'organisation.  
Un administrateur peut supprimer l'accès aux ressources pour les contributeurs ou leur donner les droits de publication sur certains portails, comme un portail de préproduction, avant de valider la demande de publication sur un portail en production.

Si vous désirez avoir plus de permissions dans une de vos organisations, contactez un administrateur de cette organisation.
