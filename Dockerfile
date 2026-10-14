# Build the client and the server, then remove the development packages.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER node
# The server listens on $PORT, or on 3000 when PORT is not set.
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
