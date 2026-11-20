
## Development environment

This project uses the following stack : Mongo, ElasticSearch, NodeJS, Express, VueJS, NUXT and Docker. The primary language used is javascript with the ES7 syntax.

We use [eslint]() both as a linter an a formatter (thanks to its fix mode). It also works on .vue files thanks to [vue-eslint-plugin](https://github.com/vuejs/eslint-plugin-vue). We strongly suggest integrating these tools in your editor, this [article](https://alligator.io/vuejs/vue-eslint-plugin/) can be useful to configure vue-eslint-plugin in your editor.

Switch to the appropriate nodejs version:

    nvm use

Install the dependencies and start the development environment (docker is required: mongo, elasticsearch, s3, simple-directory and nginx run in containers; the mock server, api and ui run in the terminal):

    npm ci
    npm run dev

The dev server is available at <http://localhost:5600/data-fair/>; run `npm run dev-fixtures` once to create the demo world (prefix `test_demo_`, `dev/resources/demo-world.json`): the account `test_demo_dev@example.org` (password `passwd`) and the example datasets of its organization, then log in with it (`npm run dev-fixtures -- --reset` recreates the world from scratch). The test accounts (`test_datafair_*`, `tests/support/sd-fixtures.ts`) are seeded by each test run. `npm run dev-deps` only starts the containers (extra arguments go to docker compose, e.g. `npm run dev-deps -- --profile events`). The default ports (5600-5649) are in `dev/default.env`, copied to `.env` the first time: `.env` overrides `dev/default.env` and is never overwritten.

Each dev process has its own npm script and reads its settings from environment variables (every key of `dev/default.env` can be overridden from the environment or `.env`): `npm run dev-setup` (idempotent builds, no container), then `npm run dev:api`, `npm run dev:ui`, `npm run dev:mock` (and `npm run dev:bridge` with an agents service), each in its own terminal. An optional service (events, agents, registry, capture, openapi-viewer) is absent when its port variable is empty (for example `EVENTS_PORT=`); `npm run dev` blanks the ports of the optional containers that are not running.

Alternative with random free ports per checkout, panes and agent-friendly status (zellij >= 0.44):

    npx --no df-dev setup
    npm run dev-zellij
    npm run dev-zellij -- --services events,agents   # with optional containers

From another terminal: `npx --no df-dev status`, `npx --no df-dev logs <pane>`, `npx --no df-dev restart <pane>`, `npx --no df-dev up <service>`.

Run test suite:

```
npm test
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
echo "export default { extends: ['@commitlint/config-conventional'] }" > commitlint.config.ts
echo 'npx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

## Documentation

Documentation is maintained in ./doc as a small separate nuxt project. Its content is built and pushed on gitlab-pages by the build. Run the documentation development server:

```
npm run doc
```

Then open http://localhost:3144

To produce a nicer print of the domentation it is possible to use a locally run instance of @data-fair/capture. For example with this URL: http://localhost:5607/api/v1/print?target=http://localhost:3144/full/functional-presentation&footer=true