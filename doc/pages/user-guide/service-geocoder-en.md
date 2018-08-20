**TODO**

Ce service permet de géocoder des adresses, c'est à dire de déterminer des coordonnées latitude / longitude à partir d'éléments constituant une adresse comme le nom et le numéro de rue, le code postal ou le code INSEE, le nom de la ville ou une requête textuelle contenant ces différents éléments.

C'est ce service que vous allez utiliser dans vos applications cartographiques pour pouvoir faire une recherche sur l'application grâce à une adresse.

## Ajout d'un service géocoder

Pour pouvoir utiliser ce service, il faut tout d'abord l'ajouter.  

Allez dans la section *SERVICES* de data-fair, puis cliquez sur le bouton *Ajouter un service*.  
Un bandeau en bas de page apparaît, cliquez sur *Choisissez un service à configurer* et sélectionner le service *Géocoder*.  
L'adresse du service géocoder Koumoul va se compléter automatiquement, vous n'avez donc pas à la modifier.  
Cliquez ensuite sur le bouton *Continuer*. Choisissez le propriétaire du service puis cliquez sur le bouton *Continuer* et enfin lancer l'import du service. **dernière étapes inutile**

## Interface du service Géocoder

Une fois ajouté, vous arrivez sur la page *DESCRIPTION* du service. Comme pour un  jeu de données, vous pouvez changer le titre du service et la description. Vous avez sur votre droite différentes informations, le propriétaire du service, l’hébergeur du service, le contact, la version du service, les termes d'utilisation du service et le nombre d'applications qui utilisent ce service.

En bas de la page de *DESCRIPTION*, vous avez les concepts **lien concept** qu'il faut associer dans votre jeu de données pour obtenir une latitude et une longitude avec l'enrichissement **lien enrichissement** via ce service.

La section *CONFIGURATION* permet de configurer le service s'il s'agit d'un service externe. Si vous utilisez des services Koumoul, vous n'aurez pas à modifier cette partie, sachez juste qu'il est possible d'importer des services externes dans la plateforme. **lien services externes**

La section *PERMISSIONS* va vous permettre de définir les droits d'utilisation du service. Vous pouvez ouvrir ce service à une organisation, à une seule personne, etc ... Pour de plus amples informations, concerter la page des permissions **lien permissions**

La section *API* va vous permettre d’accéder à la documentation API du service que vous venez de créer.

## Utilisation

Le service de géocodage peut être utilisé de deux façon différentes. Vous pouvez l'utilisez en tant qu'outil de recherche d'adresse dans vos applications cartographiques ou vous pouvez l'utiliser pour déterminer des coordonnées latitude/longitude à partir d'éléments constituant une adresse dans jeu de données.

Si vous voulez fournir un moyen de recherche d'adresses, il faudra sectionner votre service *Géocoder* lors de la configuration de chacune de vos applications cartographiques **lien application**. Une barre de recherche d'adresse sera disponible sur votre application en fonction des droits que vous avez mis sur votre service. Par exemple, votre application est publique, mais votre service n'est ouvert qu'à votre organisation, il n'y aura que les membres de votre organisation qui auront accès à la barre de recherche, tant dis que tout le monde aura accès à votre application.

Pour géocoder des adresses d'un jeu de données, vous allez devoir aller dans la section *DESCRIPTION* de votre jeu de données. Dans la section schéma de cette page, associez les concepts **lien concepts** Adresse, Rue ou lieu-dit, Commune, Numéro de rue, Code postal, Code commune aux colonnes correspondantes de votre jeu de données. **Bouton accepter**  
Si un des concepts n'est pas renseigné dans votre jeu de données, le géocodage sera moins précis.

Une fois les concepts associés, vous pouvez aller dans la partie *ENRICHISSEMENT* de votre jeu de données. Vous avez le service que vous venez d'ajouter qui est affiché (si le service n'est pas affiché, vérifiez bien que vous avez bien associer les concepts et aussi que vous avez bien les droits pour utiliser le service). Sélectionner le, puis sélectionner la latitude et la longitude dans le menu déroulant et enfin cliquez sur le bouton *Appliquer*. **Menu déroulant pas pratique** Attendez la fin de l'enrichissement. Vous avez une nouvelle section *CARTE* qui est apparue entre *VUE TABLEAU* et *PERMISSIONS*, elle vous permet d'avoir un aperçu de vos données sur une carte. Dans la section *VUE TABLEAU* vous avez deux nouvelles colonnes latitude et longitude qui sont présentes avec les coordonnées pour chacune des lignes de votre jeu de données.

Vous pouvez maintenant configurer une application Infos-localisations pour avoir un meilleur rendu de vos données. **lien infos-localisations**
