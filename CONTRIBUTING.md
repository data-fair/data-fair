
## Development environment

This project uses the following stack : Mongo, ElasticSearch, NodeJS, Express, VueJS, NUXT and Docker. The primary language used is javascript with the ES7 syntax.

We use [eslint]() both as a linter an a formatter (thanks to its fix mode). It also works on .vue files thanks to [vue-eslint-plugin](https://github.com/vuejs/eslint-plugin-vue). We strongly suggest integrating these tools in your editor, this [article](https://alligator.io/vuejs/vue-eslint-plugin/) can be useful to configure vue-eslint-plugin in your editor.

Switch to the appropriate nodejs version:

    nvm use

Install nodejs dependencies and set the checkout up (`.env` with free ports, native modules, types, UI build):

    npm ci
    npx --no df-dev setup

Start the development environment (zellij >= 0.44; core containers + ui, api, mock):

    npm run dev-zellij
    npm run dev-zellij -- --services clamav,events,agents   # with optional containers

The footer shows the dev URL; log in with an account of `dev/resources/users.json`. From another terminal: `npx --no df-dev status`, `npx --no df-dev logs <pane>`, `npx --no df-dev restart <pane>`, `npx --no df-dev up <service>`.

Run test suite:

```
npm run test
```

## Working with Git Worktrees

From the main checkout, `npx --no df-worktree <branch-name>` creates `../data-fair_<branch-name>` with its own `.env`, docker compose project and ports; `npx --no df-worktree-delete <branch-name>` removes it with its containers and volumes. Branch names: letters, digits, `.`, `_`, `-`, at most 60 characters, no `/`.

## Docker image

Test building the docker image:

```
docker build --progress=plain -t data-fair-dev .
// don't expect the following line to work fully, it will be missing service dependencies, etc.
docker run --network=host --env PORT=8081 data-fair-dev
```

## Rust native modules

To debug a rust native module inside this project (like "parquet-writer"), use something like this:

```
npm -w parquet-writer run build:debug && RUST_BACKTRACE=1 npm test
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

To produce a nicer print of the domentation it is possible to use a locally run instance of @data-fair/capture. For example with this URL: http://localhost:5607/api/v1/print?target=http://localhost:3144/full/functional-presentation&footer=true