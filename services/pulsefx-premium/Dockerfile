FROM node:24-bookworm-slim
WORKDIR /app/services/pulsefx-premium
COPY services/pulsefx-premium/package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY services/pulsefx-premium/*.mjs ./
COPY pulsefx/app/statistics.mjs /app/pulsefx/app/statistics.mjs
RUN mkdir -p /var/lib/pulsefx-premium && chown node:node /var/lib/pulsefx-premium
USER node
ENV HOST=0.0.0.0 PORT=8788
EXPOSE 8788
CMD ["node", "server.mjs"]
