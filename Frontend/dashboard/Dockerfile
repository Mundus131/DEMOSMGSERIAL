# Frontend: budowanie aplikacji React
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build produkcyjny
RUN npm run build

# Serwowanie przez nginx
FROM nginx:1.25-alpine

# Skopiuj zbudowane pliki do katalogu nginx
COPY --from=build /app/build /usr/share/nginx/html

# Skopiuj customowy config nginx, jeśli chcesz (opcjonalne)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]