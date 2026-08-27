# Simple Dockerfile - frontend already built and committed to git

FROM node:20-alpine

WORKDIR /app

# Copy backend files
COPY backend/ ./backend/

# Remove test files
RUN rm -f backend/test-db.mjs backend/verify.mjs backend/test.csv backend/test.xlsx

# Install production dependencies
WORKDIR /app/backend
RUN npm ci --production

# Copy pre-built frontend (already built and committed to git)
COPY frontend/dist ./dist

EXPOSE 3000

# WORKDIR already /app/backend, so use relative path
CMD ["node", "src/index.js"]
