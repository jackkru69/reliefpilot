FROM node:22-alpine

RUN apk add --no-cache ripgrep

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY dist/ dist/

ENV RELIEF_WEB_PORT=3120
EXPOSE 3120

USER node

CMD ["node", "dist/index.js"]
