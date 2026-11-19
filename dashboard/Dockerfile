# SmartDeskLight dashboard — production image
# Build:  docker build -t sdl-dashboard ./dashboard
# Run:    docker run -p 3000:3000 --env-file dashboard/.env.local sdl-dashboard
#
# Needs Node 22 (Next 16). The image runs the standalone server, so node_modules
# are not copied into the final layer.

FROM node:22-alpine AS deps
WORKDIR /app
# corepack ships no pnpm version here (package.json has no packageManager field),
# so install the same major the CI workflow pins.
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `public/` is optional in Next and absent from this repo; the runner stage
# copies it unconditionally, so make sure something exists to copy.
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
