# Multi-stage Dockerfile for CR Monitor - Fixed for Angular 17+

# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

# Install build dependencies for native modules (esbuild, lmdb, msgpackr, etc.)
RUN apk add --no-cache python3 make g++

# Increase Node.js memory limit for Angular build
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NG_CLI_ANALYTICS=false

# Copy package files first for better layer caching
COPY frontend/package*.json ./
RUN npm ci

# Copy source code and build
COPY frontend/ ./
RUN npx ng build --configuration production

# Stage 2: Production image with backend + built frontend
FROM node:20-alpine

WORKDIR /app/backend

# Copy backend package files first for layer caching
COPY backend/package*.json ./
RUN npm ci --production

# Copy backend source
COPY backend/ ./

# Remove test files that aren't needed
RUN rm -f test-db.mjs verify.mjs test.csv test.xlsx

# Copy built frontend from frontend-build stage
# Angular 17+ with @angular/build:application outputs to dist/<project-name>/browser
COPY --from=frontend-build /app/frontend/dist/cr-dashboard/browser ./dist/

EXPOSE 3000

CMD ["node", "src/index.js"]
