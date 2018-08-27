Les permissions vous permettent de gérer l'accès à vos ressources (jeux de données, services, applications, catalogues) à des personnes, à des organisations, au public.


### Écriture et administration : le propriétaire

Les droits d'écriture et d'administration ne peuvent pas être donnés par la page de permission.  
Une ressource de la plateforme ne peut être modifiée ou administrée que par le(s) propriétaire(s) de cette ressource. Il faut donc bien choisir le propriétaire de votre ressource.

Le propriétaire peut être vous même, une organisation au complet, ou un rôle d'une organisation.  
Par défaut, il n'y a que le propriétaire qui à accès à cette ressource.

Les administrateurs d'une organisation sont toujours propriétaires d'une ressources appartenant à un des rôles de leur organisation. Lorsque vous ajoutez une ressource, si vous choisissez un rôle d'une organisation comme propriétaire, les administrateurs de l'organisation et le rôle que vous avez choisi seront les propriétaires de la ressource.

Par exemple, vous avez quatre rôles dans votre organisation : *administrateur*, *contributeur*, *réutilisateur* et *utilisateur*.
Lorsque vous ajoutez un jeu de données dans la plateforme et que vous choisissez comme propriétaire les *contributeur*. Les *contributeur* et les *administrateur* pourront modifier et administrer ce jeu de données. Pour le moment il n'y a que ces deux rôles qui ont accès au jeu de données. Vous devez ajouter des permissions de lecture aux autres rôles de votre organisation pour qu'ils aient accès au jeu de données.

### Lecture et lister : ajout de permissions
La permission de lecture permet de donner l'accès à votre ressource. On peut donner la permission de lecture sans donner le droit de lister.
La permission de lister permet de donner le droit d'afficher, dans les différentes listes de la plateforme, votre ressource. Pour donner la permission de lister, il faut obligatoirement avoir donné le droit de lecture.

Pour attribuer les permissions vous devez aller sur la page *PERMISSIONS* de la ressource que vous voulez partager.

Si on reprend notre exemple précédent, le propriétaire du jeu de données est le rôle *contributeur* de votre organisation. Un *contributeur* ou *administrateur* de votre organisation peut donc aller sur la page *PERMISSIONS* du jeu de données et ajouter le droit **lecture** au rôle *utilisateur*.  
Les *utilisateur* pourront maintenant accéder à votre jeu de données par un lien sur lequel ils auront cliqué sur une page web ou un lien que vous leur avez donné.  
Si maintenant, l'*administrateur* donne le droit **lecture** et **lister** au rôle *réutilisateur* de votre organisation. Vos *réutilisateur* auront accès à votre jeu données à partir de notre plateforme. Autrement dit, il sera listé dans leur section [JEUX DE DONNEES](https://koumoul.com/s/data-fair/datasets), ils pourront cliquer dessus et accéder aux données du jeu en lecture.  
Si vous avez associé [les concepts](user-guide/concepts) à votre jeu de données, lorsque les *réutilisateur* vont configurer une application, le jeu sera listé comme source possible de leur application. Si une personnes, avec le rôle *utilisateur*, configure une application, elle n'aura pas le jeu de données de listé dans la source de l'application, vu qu'elle n'a que la permission de **lecture**, elle n'a pas non plus le jeu listé dans sa section [JEUX DE DONNEES](https://koumoul.com/s/data-fair/datasets) mais elle peut tout de même accéder aux données via un lien externe.  
L'*administrateur* peut aussi donner le droit de lecture et de lister à une autre organisation s'il le désire. Lorsqu'il donne ces droits, tous les rôles de l'organisation auront accès aux données de la ressource.

### Utiliser : les Services

Pour les [SERVICES](https://koumoul.com/s/data-fair/remote-services), il existe une permission supplémentaire : **Utiliser**. Cette permission donne, comme elle l'indique, le droit d'utiliser le service à une personne ou à une organisation.

### Le mode expert

Il existe aussi un mode expert qui détaille les permissions. Grâce à ce mode, vous pouvez donner des permissions plus affinées et voir en détail quels sont les droits que vous donnez en mode normal.   

Un droit coché en gris est actif.
