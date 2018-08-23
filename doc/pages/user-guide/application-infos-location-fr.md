L'application *Infos-Localisations* va vous permettre de visualiser vos données sur une carte.  Vos données devrons contenir une latitude et une longitude par point que vous voulez afficher. Si vous n'avez pas de coordonnées pour vos données, vous pouvez utiliser notre service [*Géocoder*](user-guide/service-geocoder) pour géolocaliser vos données si vous possédez des adresses.

Un fois que vous avez associer [les concepts](user-guide/concepts) Latitude, Longitude à votre jeu de données, vous pouvez utiliser l'application *Infos-Localisations*.

### Ajout d'une application Infos-Localisations

Pour ajouter une application Inf*os-Localisations*, rendez vous sur la section *Applications* puis cliquez sur le bouton *ajouter une application*.

Un bandeau en bas de page apparaît, cliquez sur *Choisissez une application à configurer* et sélectionner *Infos-Localisations*.  
L'adresse de l'application *Infos-Localisations* de Koumoul va se compléter automatiquement, vous n'avez donc pas à la modifier.  
Vous pouvez choisir le titre de l'application qui sera contenu dans l'adresse d'accès de l'application, vous aurez une adresse de ce type : https://koumoul.com/s/data-fair/app/nom-de-votre-application. Si vous ne changez pas le titre dans cette étape, l'adresse d'accès sera de ce type : [https://koumoul.com/s/data-fair/app/infos-locs5](https://koumoul.com/s/data-fair/app/infos-locs5)

Cliquez ensuite sur le bouton *Continuer*. Choisissez le propriétaire de l'application puis cliquez sur le bouton *Continuer* et enfin lancer l'import de l'application.

### Interface de l'application Infos-Localisations

Une fois ajoutée, vous arrivez sur la page *DESCRIPTION* de votre nouvelle application. Comme pour un jeu de données, vous pouvez changer le titre de l'application (si vous le changez ici, cela ne va pas changer l'adresse d'accès) et la description. L'adresse que vous avez en dessous de description sert à utiliser une application externe, si vous voulez utiliser une application Koumoul, ne changez pas cette adresse.  

Vous avez, sur votre droite, différentes informations, le propriétaire de l'application, la dernière personne qui a modifié l'application avec l'heure et la date de modification, la personne qui a créé l'application avec l'heure et la date de création.

En bas de la page de *DESCRIPTION*, vous avez la partie *Configuration*. Cliquer sur *Source de données* pour aller chercher le jeu de données que vous avez télécharger sur la plateforme et que vous voulez utiliser avec cette application. Si votre jeu de données n'est pas disponible dans la liste ou par la recherche, vérifier que vous avez télécharger le jeu de données, vérifier le nom de votre jeu de données, vérifier que vous avez bien associé les deux concepts (Latitude, Longitude) à votre jeu de données dans son schéma.  
Sélectionnez votre *service de données cartographiques* et votre service *Géocoder* si vous voulez avoir la barre de recherches d'adresses dans votre application.

Lorsque vous avez sélectionné votre jeu de données en tant que source de l'application, les différentes colonnes de votre jeu données sont sélectionnables à droite de votre écran. Vous pouvez choisir la colonne de votre jeu données qui servira de titre, de lien, description, ou d'image. Vous pouvez aussi ajouter de nouvelles colonnes qui représenterons des nouveaux champs dans les infos-bulles de votre application.

Vous pouvez aussi sélectionner votre service [*Géocoder*](user-guide/service-geocoder) qui va afficher une barre de recherche d'adresses dans l'application.

Une fois que vous avez ajouté les informations que vous voulez faire apparaître dans votre application, cliquez sur le bouton *Enregistrer*. Vous pouvez modifier autant de fois que vous voulez la configuration de votre application, les changements sont instantanés.

Pour accéder à votre application cliquer sur le bouton en haut à droite.

Voici un exemple de configuration d'une application Infos-Localisations sur les [Journées européennes du patrimoine en Occitanie](https://koumoul.com/s/data-fair/application/infos-locs5/description).

La section *PERMISSIONS* va vous permettre de définir les droits d'utilisation de votre application. Vous pouvez ouvrir cette application à une organisation, à une seule personne, la rendre publique, etc ... Pour de plus amples informations, concerter la page des [permissions](user-guide/permission).

La section *PUBLICATION* vous permet, à l'aide d'un [catalogue](user-guide/catalog), de publier votre application sur une autre plateforme.

La section *JOURNAL* va vous permettre d'avoir l'historique de toutes les actions réalisées sur votre application.

La section *API* va vous permettre d’accéder à la documentation API de l'application que vous venez de créer.

### Utilisation

Une fois que vous avez configurer correctement votre application, l'utilisation est très simple. Cliquez sur le bouton en haut à droite pour accéder à votre application, vous pouvez maintenant zoomer, grâce à la molette de votre sourie ou en double cliquant, sur la partie de la carte qui vous intéresse ou vous pouvez utiliser la fonction de recherche d'adresses si vous avez configurer le service [*Géocoder*](user-guide/service-geocoder) sur votre application.

Vous avez un marqueur par couple latitude/longitude, vous pouvez cliquer dessus. Une info-bulle apparaît à coté de votre marqueur et elle continent toutes les informations des colonnes que vous avez sélectionnées lors de la configuration de votre application.

Voici un exemple d'application *Info-Localisations* sur les [Journées européennes du patrimoine en Occitanie](https://koumoul.com/s/data-fair/app/infos-locs5).
