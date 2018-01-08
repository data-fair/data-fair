# <img alt="Data FAIR logo" src="https://cdn.rawgit.com/koumoul-dev/data-fair/master/public/assets/logo.svg" width="40"> Data FAIR

*Findable, Accessible, Interoperable and Reusable Data*

[![Build Status](https://travis-ci.org/koumoul-dev/data-fair.svg?branch=master)](https://travis-ci.org/koumoul-dev/data-fair)
[![Coverage Status](https://coveralls.io/repos/github/koumoul-dev/data-fair/badge.svg?branch=master)](https://coveralls.io/github/koumoul-dev/data-fair?branch=master)

*WARNING : This repo is a work in progress, it is not ready yet for the general public.*

## Development environment

This project uses the following stack : Mongo, ElasticSearch, NodeJS, Express, VueJS, and Docker. The primary language used is javascript with the ES7 syntax.

We use [eslint]() both as a linter an a formatter (thanks to its fix mode). It also works on .vue files thant to [vue-eslint-plugin](https://github.com/vuejs/eslint-plugin-vue). We strongly suggest integrating these tools in your editor, this [article](https://alligator.io/vuejs/vue-eslint-plugin/) can be useful to configure vue-eslint-plugin in your editor.

Install dependencies, run bundler and launch service dependencies with docker-compose:

    npm install
    npm run build
    docker-compose up -d

Run a development server with nodemon, webpack and browser-sync all watching, bundling, hot-reloading, etc:

    npm run dev

Chose an account in `test/resources/users.json` and use its email to login.

## Writing documentation

Documentation is in the `docs` folder and is built with [jekyll](https://jekyllrb.com/) when pushing to Github. The theme used is minimal-mistakes and its documentation can be [found here](https://mmistakes.github.io/minimal-mistakes/). If you want to preview the documentation on your computer you can use docker-compose (the first time will take a while):

    cd docs
    docker-compose up

You should be able to open the documentation on http://localhost:4000.
