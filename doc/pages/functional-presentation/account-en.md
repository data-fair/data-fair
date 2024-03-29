---
title: User Account
section: 2
subsection : 7
description : User Accounts
published: true
---

If the data portal is public, there is no obligation to create an account to use it. Users can, if they wish, create an account to **subscribe to notifications** and create **API keys** to use the APIs with fewer restrictions. In the case where the portal is private, users will need an account, but they will also need authorizations given by an administrator of the organization owning the portal.


To limit GDPR-related issues, a **minimum amount of data is collected** and the only data required is the user's email. He can enter a first and last name if he wishes, or put a pseudonym instead. If the user does not log in to their account for 3 years, it is automatically deleted. Users can also **delete their account** using a button, without having to make a request by email or otherwise.

Account creation is done by entering an email and a password, and there is also the possibility of going through a Gmail, Facebook, LinkedIn or Github account via the **oAuth2 protocol**. A password renewal mechanism is available for users who have lost it or wish to change it.

<img src="./images/functional-presentation/connexion.jpg"
     height="320" style="margin:15px auto;" alt="capture d'écran de la page de connexion" />

Users who create accounts by themselves have their data stored in databases. Their password is encrypted with salts and multiple hashes to guarantee maximum security. There are input rules to prevent the creation of weak passwords.

It is also possible to configure a connection to an external user directory through the LDAP protocol.


Accounts created on the portal can be used to create partnerships.  

A portal administrator can give contribution rights on one or various datasets to a user account (or an organization account) that has been created on the portal.

Partners will be able to modify the datasets by replacing the entire file or by editing the lines of the dataset from their personal space.

<img src="./images/functional-presentation/contribution.jpg"
     height="260" style="margin:15px auto;" alt="screenshot of the contribution workflow" />

Portals can be configured to accept reuse submissions.   
Reuse submissions are made from the user's personal account and are subject to moderation, with the administrator choosing whether to publish the reuse or not.


<img src="./images/functional-presentation/reutilisation.jpg"
     height="320" style="margin:15px auto;" alt="screenshot of the reuses management page" />