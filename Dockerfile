FROM node:8.4.0-alpine
MAINTAINER "contact@koumoul.com"

RUN npm install npm@5 -g

ENV NODE_ENV production
WORKDIR /webapp
ADD package.json /webapp/package.json
ADD package-lock.json /webapp/package-lock.json
RUN npm install --production

# Adding UI files
ADD public /webapp/public

# Adding server files
ADD server /webapp/server
ADD contract /webapp/contract
ADD config /webapp/config
ADD README.md /webapp/README.md

VOLUME /webapp/data
EXPOSE 8080

CMD ["node", "server/app.js"]
