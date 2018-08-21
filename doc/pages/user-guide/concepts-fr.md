Les concepts sont le lien entre les données de votre jeu de données et le service (ou application) que vous voulez utiliser.  

Par exemple, votre jeu de données contient des colonnes des *Latitude* et *Longitude*.  
Pour le moment, nos services et applications ne savent pas que c'est colonnes contiennent des coordonnées qui peuvent être réutilisables (même si c'est le nom de la colonne, nos services ne sont pas encore capable de reconnaître les données).  
Il va falloir faire pointer nos concepts, latitude et longitude vers les colonnes *Latitude* et *Longitude* de votre jeu de données pour que nos services les associent à des données qu'ils peuvent utiliser.

Pour chacun de vos jeux de données, vous allez devoir associer les concepts nécessaires au bon fonctionnement des nos services ou applications.

### Comment associer des concepts

Pour associer ces concepts, rendez vous dans la section *DESCRIPTION* de votre jeu de données, ensuite allez dans la partie schéma de cette page. Sur la colonne de droite de votre schéma vous aller pourvoir associer les concepts connus par nos services (ou applications) aux différentes colonnes de votre jeu de données. Un concept ne peut correspondre qu'a une seul colonne.


### Liste des concepts nécessaires aux services et applications
Voici la liste des concepts que vous devez associer sur chacun des jeux de données que vous voulez utiliser avec nos services ou applications.

#### Services

* [Données des entreprises](./service-entreprise-fr.md) a besoin que les concepts *SIRET* ou *SIREN* (ou les deux) soient associés aux bonnes colonnes dans votre jeu de données.
* [Géocoder](./service-geocoder.md)  a besoin que les concepts *Adresse*, *Rue ou lieu-dit*, *Commune*, *Numéro de rue*, *Code postal*, *Code commune* soient associés aux bonnes colonnes dans votre jeu de données. Si un des concepts n'est pas renseigné dans votre jeu de données, le géocodage sera moins précis (il pourrait même être erroné).
* [Cadastre](./service-land-register-fr.md) a besoin que le concept *Code parcelle* soit associé à la colonne contenant les codes parcelles de votre jeu de données.
* Divisions administratives n'est pas encore disponible pour le moment.
* Services de données cartographiques. Ce service n'a pas besoin de concepts en entrée. Il est nécessaire pour toutes vos applications cartographiques.

#### Applications

* [Infos-Parcelles](./application-infos-parcel-fr.md) a besoin que les concepts *Code parcelle*, *Latitude*, et *Longitude* soient associés aux bonnes colonnes dans votre jeu de données.
* [Infos-Localisations](./application-infos-location-fr.md) a besoin que les concepts *Latitude*, *Longitude* soient associés aux bonnes colonnes dans votre jeu de données.
* Portail thématique n'a pas besoin de concepts.
* Observatoire des entreprises n'a pas besoin de concept, il a besoin qu'un service [*Données des entreprises*](./service-entreprise-fr.md) soit configuré en tant que filtre.
