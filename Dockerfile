# Simple Dockerfile - frontend already built and committed

FROM node:20-alpine

WORKDIR /app/backend

# Copy backend files
COPY backend/ ./

# Remove test files
RUN rm -f test-db.mjs verify.mjs test.csv test.xlsx

# Install production dependencies
RUN npm ci --production

# Copy pre-built frontend
COPY frontend/dist ./dist/

EXPOSE 3000

CMD ["node", "src/index.js"]
