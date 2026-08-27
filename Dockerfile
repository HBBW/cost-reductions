# Multi-stage Dockerfile for CR Monitor

# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Production image with backend + built frontend
FROM node:20-alpine

WORKDIR /app/backend

# Copy backend files
COPY backend/ ./

# Install production dependencies
RUN npm ci --production

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./dist/

EXPOSE 3000

CMD ["node", "src/index.js"]
