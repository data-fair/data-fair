---
title: Compte utilisateur
section: 2
subsection : 7
description : Compte utilisateur
published: true
---

Si le portail de données est public, il n'y a pas d'obligation de créer de compte pour l'utiliser. Les utilisateurs peuvent, si il le souhaitent, créer un compte pour **s'abonner à des notifications** et créer des **clés d'APIs** pour utiliser les APIs avec moins de restrictions. Dans le cas ou le portail est privé, les utilisateurs auront besoin d'un compte, mais il leur faudra aussi des autorisations données par un administrateur de l'organisation propriétaire du portail.

Pour limiter les problématiques liées au RGPD, un **minimum de données est collecté** et la seule donnée requise est l'email de l'utilisateur. Il peut renseigner un prénom et un nom si il le souhaite, ou mettre un pseudonyme à la place. Si l'utilisateur ne se connecte pas à son compte pendant 3 ans, il est automatiquement supprimé. Les utilisateurs peuvent également **supprimer leur compte** à l'aide d'un bouton, sans à avoir à formuler une demande par mail ou autre.

La création de compte se fait en renseignant un email et un mot de passe, et il y a aussi la possibilité de  passer par un compte Gmail, Facebook, LinkedIn ou Github via le **protocole oAuth2**. Un mécanisme de renouvellement de mot de passe est disponible pour les utilisateurs ayant perdu celui-ci ou désirant le changer.

<img src="./images/functional-presentation/connexion.jpg"
     height="320" style="margin:15px auto;" alt="capture d'écran de la page de connexion" />

Les utilisateurs qui créent des comptes par eux même ont leur données stockées dans des bases de données. Leur mot de passe est encrypté avec sels et multiples hachages pour garantir une sécurité maximale. Il y a des règles de saisie pour empêcher la création de mots de passe faibles.

Il est également possible de configurer une connexion à un annuaire d'utilisateur externe au travers du protocole LDAP.

Les comptes créés sur le portail peuvent être utilisés pour créer des partenariats.  
Un administrateur du portail peu donner les droits de contribution sur un ou plusieurs jeux de données à un compte utilisateur (ou un compte organisation) qui a été créé sur le portail.

Les partenaires pourront ainsi modifier les jeux de données en remplaçant le fichier au complet ou en éditant les lignes du jeu de données à partir de leur espace personnel.

<img src="./images/functional-presentation/contribution.jpg"
     height="260" style="margin:15px auto;" alt="capture d'écran du workflow de contribution" />

Les portails peuvent être configuré pour accepter les soumissions de réutilisations.   
Les soumissions des réutilisations sont effectuées à partir du compte personnel de l'utilisateur et elles sont soumises à modération, c'est l'administrateur qui choisi de publier la réutilisation ou non.  


<img src="./images/functional-presentation/reutilisation.jpg"
     height="320" style="margin:15px auto;" alt="capture d'écran de la gestion des réutilisations" />
