FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ udev iputils-ping \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /app/data/configuration /app/data/logs /app/data/load-sessions/assets

ENV NODE_ENV=production
ENV PORT=5010

EXPOSE 5010

CMD ["node", "server.js"]
