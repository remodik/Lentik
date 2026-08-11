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

# Non-root запуск (node:alpine уже содержит uid 1000 пользователя node).
# Внимание для dev: при bind-mountе ../services/web:/app директория .next/ на
# хосте должна быть доступна на запись uid 1000. На Linux при ошибке прав
# выполните: sudo chown -R 1000:1000 services/web/.next — или запускайте web
# с override `user: "0:0"` (только локальная разработка).
USER node

CMD ["npm", "start"]
