FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG API_URL=http://api:8000
ENV API_URL=${API_URL}
RUN echo ">>> API_URL during build: $API_URL" && npm run build
CMD ["npm", "start"]