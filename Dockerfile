FROM koumoul/webapp-base:1.6.0
MAINTAINER "contact@koumoul.com"

ENV NODE_ENV production
WORKDIR /webapp
RUN apk add --update python make g++
ADD package.json .
ADD package-lock.json .
RUN npm install --production && node-prune

# Adding UI files
ADD public public
ADD nuxt.config.js .

# Adding server files
ADD server server
ADD shared shared
ADD contract contract
ADD config config
ADD scripts scripts
ADD README.md .

VOLUME /webapp/data
EXPOSE 8080

CMD ["node", "server"]
