# Multi-stage Dockerfile for CR Monitor

# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Stage 2: Production image with backend + built frontend
FROM node:20-alpine

WORKDIR /app/backend

# Copy backend dependencies
COPY backend/package*.json ./
RUN npm ci --production

# Copy backend source
COPY backend/src ./src/
COPY backend/scripts ./scripts/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./dist/

EXPOSE 3000

CMD ["node", "src/index.js"]
