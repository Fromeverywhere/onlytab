# 使用轻量 alpine 镜像；项目零运行时依赖，无需 npm install
FROM node:20-alpine

WORKDIR /app

# 仅复制运行所需文件
COPY package.json ./
COPY server.js ./
COPY public ./public

ENV DATA_DIR=/app/data
ENV PORT=3000
EXPOSE 3000

# 数据目录（配置 / 上传文件）运行时自动创建；用卷挂载可持久化
RUN mkdir -p /app/data

CMD ["node", "server.js"]
