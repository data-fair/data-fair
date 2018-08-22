Ce service permet de géocoder des adresses, c'est à dire de déterminer des coordonnées latitude/longitude à partir d'éléments constituant une adresse comme le nom et le numéro de rue, le code postal ou le code INSEE, le nom de la ville ou une requête textuelle contenant ces différents éléments.

C'est ce service que vous allez utiliser dans vos applications cartographiques pour pouvoir faire une recherche sur l'application grâce à une adresse.

### Ajout d'un service Géocoder

Pour pouvoir utiliser ce service, il faut tout d'abord l'ajouter.  

Allez dans la section [SERVICES](https://koumoul.com/s/data-fair/remote-services) de data-fair, puis cliquez sur le bouton *Ajouter un service*.  
Un bandeau en bas de page apparaît, cliquez sur *Choisissez un service à configurer* et sélectionnez le service *Géocoder*.  
L'adresse du service *Géocoder* Koumoul va se compléter automatiquement, vous n'avez donc pas à la modifier.  
Cliquez ensuite sur le bouton *Continuer*. Choisissez le propriétaire du service puis cliquez sur le bouton *Continuer* et enfin lancer l'import du service.

### Interface du service Géocoder

Une fois votre service ajouté, vous arrivez sur la page *DESCRIPTION* du service. Comme pour un  jeu de données, vous pouvez changer le titre du service et la description. Vous avez sur votre droite différentes informations, le propriétaire du service, l’hébergeur du service, le contact, la version du service, les termes d'utilisation du service et le nombre d'applications qui utilisent ce service.

En bas de la page de *DESCRIPTION*, vous avez [les concepts](user-guide/concepts) qu'il faut associer à un jeu de données pour avoir accès à [l'enrichissement](user-guide/enrichment) via ce service. On vous explique comment réaliser l'enrichissement un peu plus loin dans cette page.

La section *CONFIGURATION* permet de configurer le service s'il s'agit d'un service externe. Si vous utilisez des services Koumoul, vous n'aurez pas à modifier cette partie, sachez juste qu'il est possible d'importer des services externes dans la plateforme.

La section *PERMISSIONS* va vous permettre de définir les droits d'utilisation du service. Vous pouvez ouvrir ce service à une organisation, à une seule personne, etc ... Pour de plus amples informations, concertez la page des permissions **lien permissions**

La section *API* va vous permettre d’accéder à la documentation API du service que vous venez de créer.

### Utilisation : l'enrichissement

Le service *Géocoder* peut être utilisé de deux façon différentes. Vous pouvez l'utilisez en tant qu'outil de recherche d'adresses dans vos applications cartographiques ou vous pouvez l'utiliser pour enrichir des adresses présentes dans votre jeu de données..

Si vous voulez fournir un moyen de recherche d'adresses, il faudra sectionner votre service *Géocoder* lors de la configuration de chacune de vos applications cartographiques. Une barre de recherche d'adresse sera disponible sur votre application en fonction des droits que vous avez mis sur votre service. Par exemple, votre application est publique, mais votre service n'est ouvert qu'à votre organisation, il n'y aura que les membres de votre organisation qui auront accès à la barre de recherche, tant dis que tout le monde aura accès à votre application.

Pour l'enrichissement des adresses d'un jeu de données, il faut tout d'abord télécharger votre [jeu de données](user-guide/dataset) sur notre plateforme. Puis allez dans la section *DESCRIPTION* de votre jeu de données. Dans la section schéma de cette page, associez les [concepts](user-guide/concepts) *Adresse*, *Rue ou lieu-dit*, *Commune*, *Numéro de rue*, *Code postal*, *Code commune* aux colonnes correspondantes de votre jeu de données, puis cliquez sur le bouton *APPLIQUER* en haut à droite  de la section schéma.  
Si un des concepts n'est pas renseigné dans votre jeu de données, le géocodage sera moins précis (il se peut même qu'il soit erroné, tout dépend de la précision de vos données).

Une fois les concepts associés, allez dans la partie *ENRICHISSEMENT* de votre jeu de données. Vous avez le service *Géocoder* qui est affiché (si le service n'est pas affiché, vérifiez bien que vous avez bien associer les concepts et aussi que vous avez bien les droits pour utiliser le service). Sélectionner le, puis sélectionner la latitude et la longitude dans le menu déroulant et enfin cliquez sur le bouton *Appliquer*.  
Attendez la fin de l'enrichissement. Vous avez une nouvelle section *CARTE* qui est apparue entre *VUE TABLEAU* et *PERMISSIONS*, elle vous permet d'avoir un aperçu de vos données sur une carte. Dans la section *VUE TABLEAU* vous avez deux nouvelles colonnes latitude et longitude qui sont présentes avec les coordonnées pour chacune des lignes de votre jeu de données.

Vous pouvez maintenant configurer une application [Infos-Localisations](user-guide/application-infos-location) pour avoir un meilleur rendu de vos données.

Si cette page ne vous a pas fourni assez d'explication, vous avez aussi la possibilité de suivre [ce tutoriel pour pouvoir géocoder des adresses](https://koumoul.com/blog/tuto-geocoder) ou de nous [contacter](https://koumoul.com/contact).
