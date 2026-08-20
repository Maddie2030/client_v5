FROM node:22-alpine

RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

COPY services/scraper_service/package.json ./
RUN npm install --omit=dev

COPY services/scraper_service/src ./src

EXPOSE 5000

CMD ["node", "src/server.js"]
