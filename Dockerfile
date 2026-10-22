FROM node:22.23.4-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

USER node

EXPOSE 3000

CMD ["node", "server.js"]
