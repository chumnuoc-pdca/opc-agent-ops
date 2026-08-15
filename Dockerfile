# Build + chạy toàn bộ OPC Agent Ops (frontend + backend) trong 1 container
# duy nhất - server phục vụ luôn bản build của giao diện web (xem
# apps/server/src/index.js), không cần domain/CORS riêng cho 2 phần.
FROM node:22-slim

WORKDIR /app

# better-sqlite3 là native module - cài sẵn công cụ build phòng khi không
# tải được binary dựng sẵn đúng nền tảng (thường vẫn tải được, nhưng để đây
# cho chắc, tránh build fail khó hiểu).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=4001
EXPOSE 4001

CMD ["npm", "run", "start"]
