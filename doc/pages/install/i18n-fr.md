---
title: Personnalisation
section: 3
updated: 2020-12-10
description : Surcharge des libellés
published: false
---

### Internationalisation

**Attention: l'internationalisation de DataFair est un travail en cours.**

Les libellés de *DataFair* sont externalisés et internationalisés.

Pour ajouter une langue vous pouvez ajouter un fichier dans [ce répertoire](https://github.com/koumoul-dev/data-fair/tree/master/i18n) soit par surcharge de l'image docker soit en soumettant une *pull request*.

Pour modifier des valeurs de libellés vous pouvez passer des variables d'environnements au démarrage du service. La table ci-dessous contient la liste des clés supportées.

**Attention :** nous essayons de maintenir ces clés aussi stables que possibles, mais il est toujours possible que quelques modifications surviennent entre 2 versions de *DataFair*. Si vous surchargez des valeurs, vous devez vérifier que cette surcharge reste effective au moment d'une montée en version.

{{I18N_VARS}}
