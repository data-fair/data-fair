FROM node:8.9.1-alpine
MAINTAINER "contact@koumoul.com"

ENV NODE_ENV production
WORKDIR /webapp
RUN apk update && apk add python make g++
ADD package.json .
ADD package-lock.json .
RUN npm install --production

# Adding UI files
ADD public public

# Adding server files
ADD server server
ADD shared shared
ADD contract contract
ADD config config
ADD README.md .

VOLUME /webapp/data
EXPOSE 8080

CMD ["node", "server"]
