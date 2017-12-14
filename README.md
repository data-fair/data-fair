# <img alt="Accessible Data logo" src="https://cdn.rawgit.com/koumoul-dev/accessible-data/master/public/assets/logo.svg" style="width:40px"> Accessible Data

*Open Data, Open Source, Open API*

[![Build Status](https://travis-ci.org/koumoul-dev/accessible-data.svg?branch=master)](https://travis-ci.org/koumoul-dev/accessible-data)
[![Coverage Status](https://coveralls.io/repos/github/koumoul-dev/accessible-data/badge.svg?branch=master)](https://coveralls.io/github/koumoul-dev/accessible-data?branch=master)

*WARNING : This repo is a work in progress, it is not ready yet for the general public.*

## Indexing in ElasticSearch

Configure your host to run an Elasticsearch instance:

    sudo sysctl -w vm.max_map_count=262144

## Development environment

This project uses the following stack : Mongo, ElasticSearch, NodeJS, Express, VueJS, and Docker. The primary language used is javascript with the ES7 syntax.
You should use linters and beautifiers compliants with the ES7 syntax in your editor.

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
