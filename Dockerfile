FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
USER node
EXPOSE 8000
CMD ["node", "server/index.mjs"]
