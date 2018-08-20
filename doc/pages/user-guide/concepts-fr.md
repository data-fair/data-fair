Les concepts sont le lien entre les données de votre jeu de données et le service (ou l'application) que vous voulez utiliser.  

Par exemple, votre jeu de données contient des colonnes des *Latitude* et *Longitude*.  
Pour le moment, nos services et applications ne savent pas que c'est colonnes contiennent des coordonnées qui peuvent être réutilisables (même si c'est le nom de la colonne, nos services ne sont pas encore capable de reconnaître les données).  
Il va falloir faire pointer nos concepts, latitude et longitude vers les colonnes des *Latitude* et *Longitude* de votre jeu de données pour que nos services les associent à des données qu'ils peuvent utiliser.

Pour chacun de vos jeux de données, vous allez devoir associer les concepts nécessaires au bon fonctionnement des nos services ou applications.

### Comment associer des concepts

Pour associer ces concepts, vous devez aller dans la section *DESCRIPTION* de votre jeu de données, puis aller dans la partie schéma de cette page. Sur la colonne de droite de votre schéma vous aller pourvoir associer les concepts connus par nos services (ou applications) aux différentes colonnes de votre jeu de données. Un concept ne peut correspondre qu'a une seul colonne.


### Liste des concepts nécessaires aux services et applications
Voici la liste des concepts que vous devez associer sur chacun des jeux de données que vous voulez utiliser avec nos services ou applications.

##### Services

* Données des entreprises **lien vers données des entreprises** a besoin que les concepts SIRET ou SIREN (ou les deux) soient associer aux bonnes colonnes dans votre jeu de données.
* Géocoder **lien vers géocoder**  a besoin que les concepts Adresse, Rue ou lieu-dit, Commune, Numéro de rue, Code postal, Code commune soient associer aux bonnes colonnes dans votre jeu de données. Si un des concept n'est pas renseigné dans votre jeu de données, le géocodage ne sera pas précis.
* Cadastre **lien vers cadastre**  a besoin que le concept Code parcelle soit associer à la colonne contenant les code parcelle de votre jeu de données.
* Divisions administratives **lien vers Division administratives**  ???
* Services de données cartographiques **lien vers services des données** Ce service n'a pas besoin de concepts en entrée, ce service est nécessaire pour toutes vos applications cartographiques.

#### Applications

* Infos-parcelles **lien vers infos-parcelles** a besoin que les concepts Latitude, Longitude et Code parcelle soient associer aux bonnes colonnes dans votre jeu de données.
* Infos-localisations **lien vers infos-localisations** a besoin que les concepts Latitude, Longitude soient associer aux bonnes colonnes dans votre jeu de données.
* Portail thématique **lien vers portail thématique** n'a pas besoin de concepts.
* Observatoire des entreprises **lien vers observatoire des entreprises** n'a pas besoin de concept, il a besoin qu'un service *Données des entreprises* soit configuré en tant que filtre.
