FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ARG SERVICE_SCRIPT=src/manager/app.js
ENV SERVICE_SCRIPT=${SERVICE_SCRIPT}

CMD ["sh", "-c", "node ${SERVICE_SCRIPT}"]
