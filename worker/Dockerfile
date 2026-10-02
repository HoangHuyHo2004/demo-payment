# Portal worker. Build from the worker/ directory:
#   docker build -t petrol-qr-worker .
# Node 24 runs the TypeScript sources directly (type stripping), no build step.
FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY src ./src

# Never run a browser as root.
RUN useradd --create-home worker && cp -r /root/.cache /home/worker/.cache && chown -R worker:worker /home/worker /app
USER worker

ENV NODE_ENV=production
CMD ["node", "src/main.ts"]
