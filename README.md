# <img alt="Data FAIR logo" src="https://cdn.jsdelivr.net/gh/data-fair/data-fair@master/public/assets/logo.svg" width="40"> Data FAIR

*Findable, Accessible, Interoperable and Reusable Data*

[Visit documentation website](https://data-fair.github.io/3/)

![](doc/static/data-fair.gif)

## Sponsors

| | Click [here to support the development of this project](https://github.com/sponsors/koumoul-dev). |
|-|-|
| [<img alt="Koumoul logo" src="https://koumoul.com/static/logo-slogan.png" height="40">](https://koumoul.com) | [Koumoul](https://koumoul.com) develops the Data Fair ecosystem and hosts it as an online service. |
| [<img alt="Dawizz logo" src="https://dawizz.fr/logo-Dawizz-all-about-your-data-home.png" height="40">](https://dawizz.fr) | [Dawizz](https://dawizz.fr) uses Data Fair inside its platform and supports its development. |

## Development environment

This project uses the following stack : Mongo, ElasticSearch, NodeJS, Express, VueJS, NUXT and Docker. The primary language used is javascript with the ES7 syntax.

We use [eslint]() both as a linter an a formatter (thanks to its fix mode). It also works on .vue files thanks to [vue-eslint-plugin](https://github.com/vuejs/eslint-plugin-vue). We strongly suggest integrating these tools in your editor, this [article](https://alligator.io/vuejs/vue-eslint-plugin/) can be useful to configure vue-eslint-plugin in your editor.

Install nodejs dependencies and launch service dependencies with docker-compose:

    npm install
    npm run dev-deps

Run the 2 development servers with these commands in separate shells:

    npm run dev-server
    npm run dev-client

When both servers are ready, go to [http://localhost:5600](http://localhost:5600) and chose an account in `test/resources/users.json` to login with its email.

Test built nuxt distributable in dev:

```
# first set proxyNuxt to false in config/development.js
NODE_ENV=development npm run build
npm run dev-server
```

Run test suite:

```
npm run test
```

Test building the docker image:

```
docker build --network=host -t data-fair-dev .
// don't expect the following line to work fully, it will be missing service dependencies, etc.
docker run --network=host --env PORT=8081 data-fair-dev
```

## Embedded documentation

Documentation is maintained in ./doc as a small separate nuxt project. Its content is built and pushed on gitlab-pages by the Travis build.

The pages are also linked to the main nuxt project, so that any Simple Directory instance embeds its full documentation.

Run the documentation development server:

```
npm install
npm run doc
```

Then open http://localhost:3000/data-fair/
