L'application Infos-parcelles va vous permettre de visualiser vos données sur le plan cadastral. Vos données devrons contenir un code parcelle de 14 caractères sous la forme suivante :  *code commune INSEE* de 5 chiffres + *code section cadastre* de 5 caractères + *numéro parcelle cadastre* de 4 chiffres. Par exemple *56197037ZC0063* est un code valide de 14 caractères. Vos données devrons aussi contenir une latitude et une longitude par code parcelle, si vous n'avez qu'un code parcelle de 14 caractères, vous pouvez utiliser notre service *Cadastre* pour géolocaliser vos parcelles. **lien vers le service Cadastre**

Un fois que vous avez associer les concepts **lien concepts** Code parcelle, Latitude, Longitude à votre jeu de données, vous pouvez utiliser l'application Infos-Parcelles.

## Ajout d'une application Infos-Parcelles

Pour ajouter une application Infos-Parcelles, rendez vous sur la section *Applications* puis cliquez sur le bouton *ajouter une application*.

Un bandeau en bas de page apparaît, cliquez sur *Choisissez une application à configurer* et sélectionner *Infos-Parcelles*.  
L'adresse de l'application *Infos-Parcelles* de Koumoul va se compléter automatiquement, vous n'avez donc pas à la modifier.  
Vous pouvez choisir le titre de l'application qui sera contenu dans l'adresse d'accès de l'application, vous aurez une adresse de ce type : https://koumoul.com/s/data-fair/app/nom-de-votre-application. Si vous ne changez pas le titre dans cette étape, l'adresse d'accès sera de ce type : [https://koumoul.com/s/data-fair/app/infos-parcelles50](https://koumoul.com/s/data-fair/app/infos-parcelles50)

Cliquez ensuite sur le bouton *Continuer*. Choisissez le propriétaire de l'application puis cliquez sur le bouton *Continuer* et enfin lancer l'import de l'application. **dernière étape inutile**

## Interface de l'application Infos-Parcelles

Une fois ajoutée, vous arrivez sur la page *DESCRIPTION* de votre nouvelle application. Comme pour un jeu de données, vous pouvez changer le titre de l'application (si vous le changez ici, cela ne va pas changer l'adresse d'accès) et la description. L'adresse que vous avez en dessous de description sert à utiliser une application externe, si vous voulez utiliser une application Koumoul, ne changez pas cette adresse.  

Vous avez sur votre droite différentes informations, le propriétaire de l'application, la dernière personne qui a modifié l'application avec l'heure et la date de modification, la personne qui a créé l'application avec l'heure et la date de création.

En bas de la page de *DESCRIPTION*, vous avez la partie *Cofiguration*. Cliquer sur *Scource de données* pour aller chercher le jeu de données que vous avez télécharger sur la plateforme et que vous voulez utiliser avec cette application. Si votre jeu de données n'est pas disponible dans la liste ou par la recherche, vérifier que vous avez télécharger le jeu de données, vérifier le nom de votre jeu de données, vérifier que vous avez bien associé les trois concepts (Code parcelle, Latitude, Longitude) à votre jeu de données dans son schéma.  
Sélectionnez votre *service de données cartographiques* et votre service *Géocoder* si vous voulez avoir la barre de recherches d'adresses dans votre application.
**service de données cartographiques différent de fond de carte, il serait bien d'avoir le même nom**

Lorsque vous avez sélectionné votre jeu de données en tant que source de l'application, les différentes colonnes de votre jeu données sont apparues à droite de votre écran. Vous pouvez choisir la colonne de votre jeu données qui servira de légende et vous pouvez aussi choisir les colonnes qui formeront le contenu des infos-bulles de votre application. **Renommer la section légende pour quelle soit plus compréhensible**.

Une fois que vous avez ajouter les informations que vous voulez faire apparaître dans votre application, cliquez sur le bouton *Enregistrer*. Vous pouvez modifier autant de fois que vous voulez la configuration de votre application, les changements sont instantanés.

Voici un exemple de configuration sur les [permis de construire de Montpellier](https://koumoul.com/s/data-fair/application/infos-parcelles50/description).

La section *PERMISSIONS* va vous permettre de définir les droits d'utilisation de votre application. Vous pouvez ouvrir ce service à une organisation, à une seule personne, la rendre publique, etc ... Pour de plus amples informations, concerter la page des permissions **lien permissions**

La section *PUBLICATION* vous permet, à l'aide d'un catalogue **lien vers la page catalogue**, de publier votre application sur une autre plateforme.

La section *JOURNAL* va vous permettre d'avoir l'historique de toutes les actions réalisées sur votre application.

La section *API* va vous permettre d’accéder à la documentation API de l'application que vous venez de créer.

## Utilisation

Une fois que vous avez configurer correctement votre application, l'utilisation est très simple. Cliquez sur le bouton en haut a droite pour accéder à votre application, vous pouvez maintenant zoomer sur la partie de la carte qui vous intéresse ou vous pouvez utiliser la fonction de recherche d'adresses si vous avez configurer le service *Géocoder* sur votre application.

Une fois votre parcelle trouvée, vous pouvez cliquer dessus. Une info-bulle apparaît à coté de votre parcelle et elle continent toutes les colonnes que vous avez sélectionnées lors de la configuration de votre application.

Si votre niveau de zoom est assez bas et que vous pouvez voir les parcelles, vous aurez la légende que vous avez configuré en bas à droite.

Voici un exemple d'application Info-parcelles sur les [permis de construire de Montpellier](https://koumoul.com/s/data-fair/app/infos-parcelles50).
