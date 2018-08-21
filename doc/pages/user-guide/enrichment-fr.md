L’enrichissement va vous permettre de compléter et d’améliorer vos données grâces à nos services.
Chaque service va vous permettre de réaliser un type d'enrichissement.

Si vous voulez compléter vos données grâce à la base SIREN, vous aurez recours au service [*Données des entreprises*](./service-entreprise-fr.md).  
Pour géolocaliser des adresses, vous allez utiliser le service de [*Géocodage*](./service-geocoder-fr.md).  
Pour géolocaliser des codes parcelles, vous allez utiliser le service [*Cadastre*](./service-land-register-fr.md).

Chacun des différents services nécessite un certain nombre de [concepts](./concepts-fr.md) qu'il faut associer à votre jeu de données pour qu'il puisse fonctionner.

### Enrichissement via le service Données des entreprises

Un fois votre service [*Données des entreprises*](./service-entreprise-fr.md) configuré et votre [jeu de données](./dataset-fr.md) téléchargé sur notre plateforme, vous pouvez enrichir votre jeu de données qui contient des codes SIRET ou SIREN.

Pour obtenir des informations de la base SIREN sur les entreprises, allez dans la section *DESCRIPTION* de votre [jeu de données](./dataset-fr.md). Dans la partie schéma de cette page, associez [les concepts](./concepts-fr.md) SIRET ou SIREN (ou les deux) aux colonnes contenant les codes SIRET et SIREN de votre jeu de données, puis cliquez sur le bouton *APPLIQUER* en haut à droite de la section schéma.

Une fois le(s) concept()s associé(s), allez dans la partie *ENRICHISSEMENT* de votre jeu de données. Vous avez le service que vous venez d'ajouter qui est affiché (si le service n'est pas affiché, vérifiez bien que vous avez bien associé les concepts et aussi que vous avez bien les droits pour utiliser le service). Sélectionner le, puis sélectionner les informations que vous voulez ajouter dans votre jeu de données à partir du menu déroulant et enfin cliquez sur le bouton *Appliquer*. Attendez la fin de l'enrichissement. Dans la section *VUE TABLEAU* vous avez autant de nouvelles colonnes que vous avez sélectionné de données dans le menu déroulant de votre service dans la section *ENRICHISSEMENT*.

Si vous avez ajouté les latitudes et longitudes, vous pouvez configurer une application [Infos-localisations](./application-infos-location-fr.md) pour avoir un meilleur rendu de vos données.

### Enrichissement via le service Géocodage

Un fois votre service [*Géocodage*](./service-geocoder-fr.md) configuré et votre [jeu de données](./dataset-fr.md) téléchargé sur notre plateforme, vous pouvez enrichir votre jeu de données qui contient vos adresses.

Pour géocoder des adresses d'un jeu de données, il faut tout d'abord télécharger votre [jeu de données](./dataset-fr.md) sur notre plateforme. Puis allez dans la section *DESCRIPTION* de votre jeu de données. Dans la section schéma de cette page, associez les [concepts](./concepts-fr.md) *Adresse*, *Rue ou lieu-dit*, *Commune*, *Numéro de rue*, *Code postal*, *Code commune* aux colonnes correspondantes de votre jeu de données, puis cliquez sur le bouton *APPLIQUER* en haut à droite de la section schéma.  
Si un des concepts n'est pas renseigné dans votre jeu de données, le géocodage sera moins précis (il se peut même qu'il soit erroné, tout dépend de la précision de vos données).

Une fois les concepts associés, allez dans la partie *ENRICHISSEMENT* de votre jeu de données. Vous avez le service que vous venez d'ajouter qui est affiché (si le service n'est pas affiché, vérifiez bien que vous avez bien associer les concepts et aussi que vous avez bien les droits pour utiliser le service). Sélectionner le, puis sélectionner la latitude et la longitude dans le menu déroulant et enfin cliquez sur le bouton *Appliquer*.  
Attendez la fin de l'enrichissement. Vous avez une nouvelle section *CARTE* qui est apparue entre *VUE TABLEAU* et *PERMISSIONS*, elle vous permet d'avoir un aperçu de vos données sur une carte. Dans la section *VUE TABLEAU* vous avez deux nouvelles colonnes latitude et longitude qui sont présentes avec les coordonnées pour chacune des lignes de votre jeu de données.

Vous pouvez maintenant configurer une application [Infos-localisations](./application-infos-location-fr.md) pour avoir un meilleur rendu de vos données.

### Enrichissement via le service cadastre

Un fois votre service [*Cadastre*](./service-land-register-fr.md) configuré et votre [jeu de données](./dataset-fr.md) téléchargé sur notre plateforme, vous pouvez enrichir votre jeu de données qui contient vos codes parcelles.

Pour géocoder des codes parcelles valides d'un jeu de données, les codes parcelles doivent être composé de 14 caractères : *code commune INSEE* de 5 chiffres + *code section cadastre* de 5 caractères + *numéro parcelle cadastre* de 4 chiffres. Par exemple *56197037ZC0063* est un code valide de 14 caractères.

Une fois que vous êtes en disposition d'un jeu de données avec des codes parcelles valides, téléchargez votre [jeu de données](./dataset-fr.md) sur notre plateforme.  
Puis, allez dans la section *DESCRIPTION* de votre jeu de données. Dans la partie schéma de cette page, associez [le concept](./concepts-fr.md)  *Code parcelle* à la colonne contenant les codes parcelles de votre jeu de données, puis cliquez sur le bouton *APPLIQUER* en haut à droite de la section schéma.

Ensuite, allez dans la partie *ENRICHISSEMENT* de votre jeu de données. Vous avez le service que vous venez d'ajouter qui est affiché (si le service n'est pas affiché, vérifiez bien que vous avez bien associer les concepts et aussi que vous avez bien les droits pour utiliser le service). Sélectionner le, puis sélectionner la latitude et la longitude dans le menu déroulant et enfin cliquez sur le bouton *Appliquer*.  
Attendez la fin de l'enrichissement. Vous avez une nouvelle section *CARTE* qui est apparue entre *VUE TABLEAU* et *PERMISSIONS*, elle vous permet d'avoir un aperçu de vos données sur une carte. Dans la section *VUE TABLEAU* vous avez deux nouvelles colonnes latitude et longitude qui sont présentes avec les coordonnées pour chacune des lignes de votre jeu de données.

Vous pouvez maintenant configurer une application [Infos-Parcelles](./application-infos-parcel-fr.md) pour avoir un meilleur rendu de vos données.
