# Node 24 原生支援執行 TypeScript，不需要 build 步驟
FROM node:24-alpine

WORKDIR /app

# 先裝相依，讓這層可以被快取
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# 平台會用 PORT 環境變數指定實際埠號
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/index.ts"]
