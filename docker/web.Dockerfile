# Web image (decision F: containerized web; Docker images ship Bun). Builds the Next
# app and runs migrations then `next start`. Same image family as the hosted shape.

FROM oven/bun:1.2.21 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2.21 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.2.21 AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
# Apply migrations on boot, then serve. Idempotent: drizzle skips already-applied ones.
CMD ["sh", "-c", "bun run db:migrate && bun run start"]
