Ce service vous permet d'enrichir vos jeux de données à partir d'une colonne contenant un code SIRET ou un code SIREN. Votre jeu de données doit donc contenir une colonne avec des codes SIRET ou SIREN. Grâce à l'un de ces codes, vous allez avoir accès à la base SIREN utilisée dans notre service et pouvoir obtenir des informations sur les entreprises ou bâtiments correspondants aux codes SIREN/SIRET.

Ce service peut aussi être utilisé en tant que filtre de l'application *Observatoire des entreprises* grâce a [ce tutoriel](https://koumoul.com/blog/tuto-observatoire-entreprise-etablissements) qui vous explique comment configurer le service pour visualiser les établissements d'une entreprise ou [ce tutoriel](https://koumoul.com/blog/tuto-lait) qui permet de configurer le service pour visualiser un secteur d'activité sur un territoire donné.

### Ajout d'un service Données des entreprises

Pour pouvoir utiliser ce service pour l'enrichissement, il faut tout d'abord l'ajouter.  

Allez dans la section *SERVICES* de data-fair, puis cliquez sur le bouton *Ajouter un service*.  
Un bandeau en bas de page apparaît, cliquez sur *Choisissez un service à configurer* et sélectionner le service *Données des entreprises*.  
L'adresse du service *Données des entreprises* de Koumoul va se compléter automatiquement, vous n'avez donc pas à la modifier.  
Cliquez ensuite sur le bouton *Continuer*. Choisissez le propriétaire du service puis cliquez sur le bouton *Continuer* et enfin lancer l'import du service.

### Interface du service Données des entreprises

Une fois votre service ajouté, vous arrivez sur la page *DESCRIPTION* du service. Comme pour un jeu de données, vous pouvez changer le titre du service et la description. Vous avez sur votre droite différentes informations, le propriétaire du service, l’hébergeur du service, le contact, la version du service, les termes d'utilisation du service et le nombre d'applications qui utilisent ce service.

En bas de la page de *DESCRIPTION*, vous avez [les concepts](./concepts-fr.md) qu'il faut associer dans votre jeu de données pour obtenir différentes informations des entreprises avec [l'enrichissement](./enrichment-fr.md) via ce service. Vous pouvez obtenir les latitudes, longitudes, les codes commune, etc ... si ils sont renseignés dans la base SIREN.

La section *CONFIGURATION* permet de configurer le service s'il s'agit d'un service externe. Si vous utilisez les services Koumoul, vous n'aurez pas à modifier cette partie, sachez juste qu'il est possible d'importer des services externes dans la plateforme.

La section *PERMISSIONS* va vous permettre de définir les droits d'utilisation du service. Vous pouvez ouvrir ce service à une organisation, à une seule personne, etc ... Pour de plus amples informations, concertez la page des permissions **lien permissions**

La section *API* va vous permettre d’accéder à la documentation API du service que vous venez de créer.

### Utilisation : l'enrichissement

Pour obtenir des informations de la base SIREN sur les entreprises, allez dans la section *DESCRIPTION* de votre [jeu de données](./dataset-fr.md). Dans la partie schéma de cette page, associez [les concepts](./concepts-fr.md) SIRET ou SIREN (ou les deux) aux colonnes contenant les codes SIRET et SIREN de votre jeu de données, puis cliquez sur le bouton *APPLIQUER* en haut à droite de la section schéma.

Une fois le(s) concept()s associé(s), allez dans la partie *ENRICHISSEMENT* de votre jeu de données. Vous avez le service que vous venez d'ajouter qui est affiché (si le service n'est pas affiché, vérifiez bien que vous avez bien associé les concepts et aussi que vous avez bien les droits pour utiliser le service). Sélectionner le, puis sélectionner les informations que vous voulez ajouter dans votre jeu de données à partir du menu déroulant et enfin cliquez sur le bouton *Appliquer*. Attendez la fin de l'enrichissement. Dans la section *VUE TABLEAU* vous avez autant de nouvelles colonnes que vous avez sélectionné de données dans le menu déroulant de votre service dans la section *ENRICHISSEMENT*.

Si vous avez ajouté les latitudes et longitudes, vous pouvez configurer une application [Infos-localisations](./application-infos-location-fr.md) pour avoir un meilleur rendu de vos données.
