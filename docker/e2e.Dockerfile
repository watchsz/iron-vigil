# Version de l'image = version de @playwright/test dans package.json
FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npx", "playwright", "test"]
