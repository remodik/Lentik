FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .

# External API base URL (must be set at build time for static export)
ARG NEXT_PUBLIC_API_BASE=https://api.lentik.app
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}

ARG NEXT_PUBLIC_WS_BASE
ENV NEXT_PUBLIC_WS_BASE=${NEXT_PUBLIC_WS_BASE}

RUN echo ">>> API base: $NEXT_PUBLIC_API_BASE" && npm run build
CMD ["npm", "start"]
