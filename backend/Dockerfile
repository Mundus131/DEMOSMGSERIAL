# Backend: Node.js
FROM node:20-alpine AS build

# Narzędzia do node-gyp (np. diskusage)
RUN apk add --no-cache python3 make g++

# Utwórz katalog roboczy
WORKDIR /app

# Skopiuj package.json i package-lock.json
COPY package*.json ./

# Instalacja zależności
RUN npm install

# Skopiuj resztę plików backendu
COPY . .

# Wystaw port (zmień jeśli Twój backend działa na innym)
EXPOSE 5010


# Komenda startowa
CMD ["node", "server.js"]
