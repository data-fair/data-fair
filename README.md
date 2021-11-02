# <img alt="Data FAIR logo" src="https://cdn.jsdelivr.net/gh/data-fair/data-fair@master/public/assets/logo.svg" width="40"> Data FAIR

*Findable, Accessible, Interoperable and Reusable Data*

[Visit documentation website (french)](https://data-fair.github.io/2/)

![](doc/static/data-fair.gif)


## Development environment

This project uses the following stack : Mongo, ElasticSearch, NodeJS, Express, VueJS, NUXT and Docker. The primary language used is javascript with the ES7 syntax.

We use [eslint]() both as a linter an a formatter (thanks to its fix mode). It also works on .vue files thanks to [vue-eslint-plugin](https://github.com/vuejs/eslint-plugin-vue). We strongly suggest integrating these tools in your editor, this [article](https://alligator.io/vuejs/vue-eslint-plugin/) can be useful to configure vue-eslint-plugin in your editor.

This project requires a recent yarn version:

    npm i -g yarn

Install dependencies and launch service dependencies with docker-compose:

    yarn
    docker-compose up -d

Run the 2 development servers with these commands in separate shells:

    yarn run dev-server
    yarn run dev-client

When both servers are ready, go to [http://localhost:5600](http://localhost:5600) and chose an account in `test/resources/users.json` to login with its email.

Test built nuxt distributable in dev:

   # first set proxyNuxt to false in config/development.js
   NODE_ENV=development yarn run build
   yarn run dev-server


## Embedded documentation

Documentation is maintained in ./doc as a small separate nuxt project. Its content is built and pushed on gitlab-pages by the Travis build.

The pages are also linked to the main nuxt project, so that any Simple Directory instance embeds its full documentation.

Run the documentation development server:

```
yarn
yarn run doc
```

Then open http://localhost:3000/data-fair/
