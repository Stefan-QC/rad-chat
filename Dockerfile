# Eén image met alles: de gebouwde React-app, de Node-host en de Python-API (die de host zelf start).
FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY backend/api/requirements.txt backend/api/requirements.txt
RUN python3 -m venv backend/api/.venv \
    && backend/api/.venv/bin/pip install --no-cache-dir -r backend/api/requirements.txt
COPY backend/api/app backend/api/app
COPY backend/server backend/server
COPY --from=frontend /app/frontend/dist frontend/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Zet SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY en SUPABASE_SERVICE_ROLE_KEY als omgevingsvariabelen bij het draaien.
CMD ["node", "backend/server/server.mjs"]
