#!/usr/bin/env bash
# 在装有 Docker 的主机上执行：构建镜像并导出为 tar（标签 onlytab:0.1）
set -e
TAG="onlytab:0.1"

docker build -t "$TAG" .
docker save "$TAG" -o onlytab-0.1.tar

echo "✅ 已构建并导出镜像：$TAG"
echo "   文件：onlytab-0.1.tar"
echo "导入到其它机器：docker load -i onlytab-0.1.tar"
echo "运行：docker compose up -d --build   # 或 docker run -d -p 3000:3000 -v \$PWD/data:/app/data onlytab:0.1"
