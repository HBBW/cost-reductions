# Multi-stage Dockerfile for CR Monitor - Pre-built frontend

# Stage 1: Production image with backend + pre-built frontend
FROM node:20-alpine

WORKDIR /app/backend

# Copy backend package files first for layer caching
COPY backend/package*.json ./
RUN npm ci --production

# Copy backend source
COPY backend/ ./

# Remove test files that aren't needed
RUN rm -f test-db.mjs verify.mjs test.csv test.xlsx

# Copy pre-built frontend (built locally)
COPY frontend/dist/cr-dashboard/browser ./dist/

EXPOSE 3000

CMD ["node", "src/index.js"]