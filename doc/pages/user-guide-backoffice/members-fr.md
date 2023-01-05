---
title: Gestion de l'organisation
section: 10
subsection : 1
updated: 2021-09-20
description : Inviter les membres de votre organisation grâce à leur e-mail.
published: true
---

Lorsque vous êtes administrateur de votre organisation, la section **Gestion de l'organisation** est accessible dans la barre de navigation de Data Fair.

Sur cette page, vous pouvez gérer les différents membres de votre organisation :
* Inviter de nouveaux membres par e-mail
* Changer le rôle des membres
* Exclure un membre

![Membres](./images/user-guide-backoffice/orga-membres.jpg)  
*Gérez les membres de votre organisation*

Le changement de rôle et la suppression d'un membre peut être accompli grâce aux boutons d'actions de la ligne du membre.

### Invitation
Pour inviter un membre dans votre organisation, vous n'avez besoin que de son e-mail.

![Invitation](./images/user-guide-backoffice/orga-invitation.jpg)  
*Invitez les membres de votre organisation par email*

Un e-mail d'invitation est envoyé sur l'email renseigné.  
L'email contient un lien pour créer son compte sur la plateforme et faire partie de votre organisation.  
Une fois connectée, la personne invitée aura accès aux différentes pages de l'organisation selon le rôle que vous lui avez attribué.

### Rôles

Une organisation permet de travailler à plusieurs sur différents jeux de données et visualisations.  

Les organisations suivent certaines règles :
* Tous les membres d'une organisation n'ont pas les même droits.  
* Les administrateurs d'une organisation peuvent modifier les rôles des différents membres de l'organisation.  
* Il existe trois rôles différents, utilisateur, contributeur et administrateur.  

<p>
</p>

Chaque rôle possède des permissions différentes.  

Permissions par défaut de Data Fair :

| Actions | Utilisateur | Contributeur | Administrateur |
| ----- | ---- | ---- | ---- |
| Ajout d'un jeu de données | | x | x |
| Lecture d'un jeu de données | x | x | x |
| Modification d'un jeu de données |  | x | x |
| Administration d'un jeu de données | |  | x |
| Ajout d'une visualisation | | x | x |
| Lecture d'une visualisation | x | x | x |
| Edition d'une visualisation |  | x | x |
| Administration d'une visualisation | |  | x |
| Accès et modification des paramètres de l'organisation|  |  | x |
| Création et modification du portail de l'organisation |  |  | x |


L'administration d'un jeu de données (ou une visualisation) consiste dans la suppression et la visibilité.  
L'administrateur est le seul à pouvoir rendre public ou supprimer un jeu de données (ou une visualisation).  
Le rôle utilisateur est utilisé pour donner accès aux ressources privées de l'organisation.  

Les permissions pour chaque ressource peuvent être modifiées par les administrateurs de l'organisation.  
Un administrateur peut supprimer l'accès aux ressources pour les contributeurs ou leur donner les droits de publication sur certains portail comme par exemple un portail de préproduction avant qu'il valide la demande de publication sur un portail en production.

Si vous désirez avoir plus de permissions dans une de vos organisations, contactez un administrateur de cette organisation.
