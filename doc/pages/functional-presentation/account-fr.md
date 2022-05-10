---
title: Compte utilisateur
section: 2
subsection : 7
description : Compte utilisateur
published: true
---

Si le portail de données est public, il n'y a pas d'obligation de créer de compte pour l'utiliser. Les utilisateurs peuvent, si il le souhaitent, créer un compte pour **s'abonner à des notifications** et créer des **clés d'APIs** pour utiliser les APIs avec moins de restrictions. Dans le cas ou le portail est privé, les utilisateurs auront besoin d'un compte, mais il leur faudra aussi des autorisations données par un administrateur de l'organisation propriétaire du portail.

Pour limiter les problématiques liées au RGPD, un **minimum de données est collecté** et la seule donnée requise est l'email de l'utilisateur. Il peut renseigner un prénom et un nom si il le souhaite, ou mettre un pseudonyme à la place. Si l'utilisateur ne se connecte pas à son compte pendant 3 ans, il est automatiquement supprimé. Les utilisateurs peut également **supprimer leur compte** à l'aide d'un bouton, sans à avoir à formuler une demande par mail ou autre.

La création de compte se fait en renseignant un email et un mot de passe, et il y a aussi la possibilité de  passer par un compte Gmail, Facebook, LinkedIn ou Github via le **protocole oAuth2**. Un mécanisme de renouvellement de mot de passe est disponible pour les utilisateurs ayant perdu celui-ci ou désirant le changer.

<img src="./images/functional-presentation/connexion.jpg"
     height="160" style="margin:15px auto;" />

Les utilisateurs qui créent des comptes par eux même ont leur données stockées dans des bases de données. Leur mot de passe est encrypté avec sels et multiple hachage pour garantir une sécurité maximale. Il y a des règles de saisie de mot de passe pour éviter d'en avoir de facilement trouvables.

Il est également possible de configurer une connexion à un annuaire d'utilisateur externe au travers du protocole LDAP.
