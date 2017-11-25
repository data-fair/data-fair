FROM node:8.9.1-alpine
MAINTAINER "contact@koumoul.com"

ENV NODE_ENV production
WORKDIR /webapp
ADD package.json .
ADD package-lock.json .
RUN npm install --production

# Adding UI files
ADD public .

# Adding server files
ADD server .
ADD contract .
ADD config .
ADD README.md .

VOLUME /webapp/data
EXPOSE 8080

CMD ["node", "server/app.js"]
