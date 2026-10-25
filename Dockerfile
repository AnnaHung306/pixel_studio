# 通用 Dockerfile（選用）：任何支援 Docker 的主機都能跑。資料存在 /data，請掛載 volume。
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server/index.js"]
