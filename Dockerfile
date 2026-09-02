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

# Copy pre-built frontend to the exact path backend expects
# Backend resolves: path.resolve(__dirname, '../dist/cr-dashboard/browser') 
# where __dirname = /app/backend/src, so it expects /app/backend/dist/cr-dashboard/browser
RUN mkdir -p /app/backend/dist/cr-dashboard/browser
COPY frontend/dist/cr-dashboard/browser /app/backend/dist/cr-dashboard/browser/

EXPOSE 3000

CMD ["node", "src/index.js"]