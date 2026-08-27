# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

# Mencegah crash kehabisan RAM saat build Angular
ENV NODE_OPTIONS="--max-old-space-size=2048"

# 1. Optimasi cache Docker: Install dependency dulu
COPY frontend/package*.json ./
RUN npm ci

# 2. Copy source code & jalankan build Angular
COPY frontend/ ./
ENV NG_CLI_ANALYTICS=false
RUN npm run build -- --configuration production

# Stage 2: Production image with backend + built frontend
FROM node:20-alpine
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
RUN rm -f test-db.mjs verify.mjs test.csv test.xlsx

# 3. KUNCI PERBAIKAN: Path menunjuk langsung ke dist/cr-dashboard/browser sesuai angular.json
COPY --from=frontend-build /app/frontend/dist/cr-dashboard/browser ./dist/

EXPOSE 3000

CMD ["node", "src/index.js"]
