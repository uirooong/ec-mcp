FROM oven/bun:1-slim

WORKDIR /app

COPY --chown=bun:bun package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY --chown=bun:bun src ./src

USER bun
EXPOSE 3001

CMD ["bun", "src/index.ts"]
