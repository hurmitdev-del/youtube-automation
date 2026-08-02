# ---------- Build Stage ----------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# ---------- Production Stage ----------
FROM node:22-bookworm-slim

# Install ffmpeg (includes ffprobe)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy any runtime assets/config if they exist
COPY --from=builder /app/docs ./docs
# COPY --from=builder /app/prompts ./prompts
# COPY --from=builder /app/templates ./templates

# Cloud Run listens on PORT
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "run", "serve"]