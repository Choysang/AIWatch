# Worker image (decision F: single Bun worker). Runs crawling, scoring, promotion, and
# the report cron. TZ is set so the daily-report cron fires at 08:00 in APP_TZ (decision E).

FROM oven/bun:1.2.21 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.2.21 AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["bun", "run", "worker"]
