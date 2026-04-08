# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all deps (including devDependencies for tsc)
RUN npm ci

# Copy source and build scripts
COPY tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/

# Run prebuild (copy-knowledge) + tsc
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Fly.io uses PORT env var
ENV PORT=8080
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://localhost:'+process.env.PORT+'/health',res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
