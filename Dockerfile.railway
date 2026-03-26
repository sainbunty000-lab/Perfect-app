FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

RUN pnpm install --filter @workspace/api-server...

WORKDIR /app/artifacts/api-server
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
