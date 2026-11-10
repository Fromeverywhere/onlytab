# 在装有 Docker 的 Windows 主机上执行：构建镜像并导出为 tar（标签 onlytab:0.1）
$tag = "onlytab:0.1"

docker build -t $tag .
docker save $tag -o onlytab-0.1.tar

Write-Host "已构建并导出镜像：$tag"
Write-Host "文件：onlytab-0.1.tar"
Write-Host "导入到其它机器：docker load -i onlytab-0.1.tar"
