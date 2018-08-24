Les concepts sont le lien entre les données de votre jeu de données et le service (ou application) que vous voulez utiliser.

Le choix de concepts appropriés pour vos champs est ce qui va permettre de réutiliser vos données dans des applications tierces ou de les enrichir avec des services distants.

Par exemple, votre jeu de données contient des colonnes *Latitude* et *Longitude*.  
Pour le moment, nos services et applications ne savent pas que ces colonnes contiennent des coordonnées qui peuvent être réutilisables (même si c'est le nom de la colonne, nos services ne sont pas encore capable de reconnaître les données).  
Lorsque vous allez faire pointer nos concepts, latitude et longitude vers les colonnes *Latitude* et *Longitude* de votre jeu de données, nos services et applications vont les associer à des données qu'ils peuvent utiliser. Vous pourrez ainsi projeter vos données sur des cartes par exemple.

### Comment associer des concepts

Pour associer ces concepts, rendez vous dans la section *DESCRIPTION* de votre jeu de données, ensuite allez dans la partie schéma de cette page. Sur la colonne de droite de votre schéma vous aller pourvoir associer les concepts connus par nos services (ou applications) aux différentes colonnes de votre jeu de données. Un concept ne peut correspondre qu'a une seul colonne.


### Liste des concepts nécessaires aux services et applications
Voici la liste des services et applications Koumoul et les concepts que vous devez associer à votre jeu de données pour leur bon fonctionnement.

#### Services

* [Données des entreprises](user-guide/service-entreprise) a besoin que les concepts *SIRET* ou *SIREN* (ou les deux) soient associés aux bonnes colonnes dans votre jeu de données.
* [Géocoder](user-guide/service-geocoder) a besoin que les concepts *Adresse*, *Rue ou lieu-dit*, *Commune*, *Numéro de rue*, *Code postal*, *Code commune* soient associés aux bonnes colonnes dans votre jeu de données. Si un des concepts n'est pas renseigné dans votre jeu de données, le géocodage sera moins précis (il pourrait même être erroné).
* [Cadastre](user-guide/service-land-register) a besoin que le concept *Code parcelle* soit associé à la colonne contenant les codes parcelles de votre jeu de données.
* Divisions administratives n'est pas encore disponible pour le moment.
* Services de données cartographiques. Ce service n'a pas besoin de concepts en entrée. Il est nécessaire pour toutes vos applications cartographiques.

#### Applications

* [Infos-Parcelles](user-guide/application-infos-parcel) a besoin que les concepts *Code parcelle*, *Latitude*, et *Longitude* soient associés aux bonnes colonnes dans votre jeu de données.
* [Infos-Localisations](user-guide/application-infos-location) a besoin que les concepts *Latitude*, *Longitude* soient associés aux bonnes colonnes dans votre jeu de données.
* Portail thématique n'a pas besoin de concepts.
* Observatoire des entreprises n'a pas besoin de concept, il a besoin qu'un service [*Données des entreprises*](user-guide/service-entreprise) soit configuré en tant que filtre.
