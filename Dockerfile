# Simple multi-stage Dockerfile for CR Monitor

# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/ ./frontend/
RUN cd frontend && npm ci && npm run build

# Stage 2: Production image with backend + built frontend
FROM node:20-alpine

WORKDIR /app/backend

# Copy backend files
COPY backend/ ./

# Remove test files that aren't needed
RUN rm -f test-db.mjs verify.mjs test.csv test.xlsx

# Install production dependencies
RUN npm ci --production

# Copy built frontend to where backend expects it
COPY --from=frontend-build /app/frontend/dist ./dist/

EXPOSE 3000

CMD ["node", "src/index.js"]
