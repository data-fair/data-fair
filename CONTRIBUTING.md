
## Development environment

This project uses the following stack : Mongo, ElasticSearch, NodeJS, Express, VueJS, NUXT and Docker. The primary language used is javascript with the ES7 syntax.

We use [eslint]() both as a linter an a formatter (thanks to its fix mode). It also works on .vue files thanks to [vue-eslint-plugin](https://github.com/vuejs/eslint-plugin-vue). We strongly suggest integrating these tools in your editor, this [article](https://alligator.io/vuejs/vue-eslint-plugin/) can be useful to configure vue-eslint-plugin in your editor.

Switch to the appropriate nodejs version:

    nvm use

Install nodejs dependencies:

    npm install

If you use [zellij](https://zellij.dev/) you can replace all the following steps with `npm run dev-zellij`, otherwise follow the next instructions.

Run the services dependencies:

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

## Docker image

Test building the docker image:

```
docker build --network=host -t data-fair-dev .
// don't expect the following line to work fully, it will be missing service dependencies, etc.
docker run --network=host --env PORT=8081 data-fair-dev
```

## Git quality checks

This project uses [husky](https://typicode.github.io/husky/) to ensure quality of contributions.

The original setup was created like so:

```
npm i -D husky
npm pkg set scripts.prepare="husky install"
npm run prepare
npx husky add .husky/pre-commit "npm run lint"

npm i -D @commitlint/config-conventional @commitlint/cli
echo "module.exports = { extends: ['@commitlint/config-conventional'] }" > commitlint.config.js
npx husky add .husky/commit-msg 'npx --no-install commitlint --edit ""'
```

## Documentation

Documentation is maintained in ./doc as a small separate nuxt project. Its content is built and pushed on gitlab-pages by the build. Run the documentation development server:

```
npm run doc
```

Then open http://localhost:3144
