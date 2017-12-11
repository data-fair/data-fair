# Permissions

Le contrôle d'accès sur les flux de données se fait avec un système de permissions. Il y a des permissions sur les jeux de données et les APIs externes, mais pas sur les applications : celles-ci ont besoin des flux de données pour fonctionner, et en contrôlant les modalités d'accès à ces flux on peut déterminer si l'utilisateur peut utiliser l'application. Le niveau de granularité du contrôle d'accès est le fait d'être propriétaire ou non de la ressource (droits sur toutes les opérations liées à cette ressource), ou sinon sur chaque opération unitairement.

## Utilisateurs et Organisations

Le système des permissions repose sur une modélisation assez simple des concepts d'utilisateurs et d'organisations, comme par exemple celui implémenté dans [simple-directory](https://github.com/koumoul-dev/simple-directory) : les utilisateurs peuvent appartenir à plusieurs organisations et une organisation peut contenir plusieurs utilisateurs, il n'y a pas de relations entre les organisations.

Que ce soit au niveau du propriétaire ou des permissions, il y a toujours possibilité de les définir à un niveau unitaire qui est un utilisateur, ou à un niveau de groupe qui est l'organisation. Dans ce 2e cas, tous les membres de l'organisation bénéficient alors de la propriété de la ressource ou de la permission d'accès.

Ce système est simple mais permet de couvrir beaucoup de cas fonctionnels. Il faut cependant faire attention car il peut être dangereux. Il faut notamment bien régler les droits de propriété ou d'écriture et nous conseillons de les garder à un niveau utilisateur, et d'ouvrir des droits de lecture sur des organisations.

## Portée des permissions

L'utilisateur propriétaire ou tous les membres de l'organisation propriétaire peuvent faire toutes les opérations sur la ressource possédée. Pour les autres utilisateurs, la permission est octroyée à un niveau opération. Une opération est un point d'accès exposé par l'API (externe ou d'un jeu de données). On peut par exemple accorder la permission à quelqu'un de lire la description d'un jeu de données, mais pas les données.
