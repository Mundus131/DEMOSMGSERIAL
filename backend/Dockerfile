# Backend: Node.js
FROM node:18

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