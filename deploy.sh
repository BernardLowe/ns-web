#!/bin/bash

# 部署脚本：自动拉取最新代码、更新依赖、构建并部署到OpenResty服务器目录
# 同时支持版本备份和失败回滚

set -e  # 遇到错误时退出

# 配置变量
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_TARGET="/usr/local/openresty/nginx/html/ns-web"
BACKUP_DIR="/tmp/ns-web-backups"
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
BACKUP_NAME="ns-web-backup-$TIMESTAMP"
BUILD_DIR="dist"

echo "=== NS-WEB 部署脚本 ==="
echo "时间: $(date)"
echo "项目目录: $PROJECT_DIR"
echo "部署目标: $DEPLOY_TARGET"
echo "备份目录: $BACKUP_DIR"
echo ""

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份当前版本（如果存在）
if [ -d "$DEPLOY_TARGET" ]; then
    echo "正在备份当前版本..."
    cp -r "$DEPLOY_TARGET" "$BACKUP_DIR/$BACKUP_NAME"
    echo "已备份到: $BACKUP_DIR/$BACKUP_NAME"
else
    echo "目标目录不存在，无需备份"
fi
echo ""

# 拉取最新代码
echo "正在拉取最新代码..."
git stash  # 保存本地修改（如果有）
git pull origin main  # 如果你的默认分支不是main，请修改这里
echo "代码更新完成"
echo ""

# 更新依赖
echo "正在更新依赖..."
if command -v pnpm &> /dev/null; then
    pnpm install
elif command -v npm &> /dev/null; then
    npm install
elif command -v yarn &> /dev/null; then
    yarn install
else
    echo "错误: 未找到包管理器 (pnpm/npm/yarn)"
    exit 1
fi
echo "依赖更新完成"
echo ""

# 构建项目
echo "正在构建项目..."
if command -v pnpm &> /dev/null; then
    pnpm build
elif command -v npm &> /dev/null; then
    npm run build
elif command -v yarn &> /dev/null; then
    yarn build
else
    echo "错误: 未找到包管理器 (pnpm/npm/yarn)"
    exit 1
fi
echo "项目构建完成"
echo ""

# 检查构建是否成功
if [ ! -d "$PROJECT_DIR/$BUILD_DIR" ]; then
    echo "错误: 构建失败，未找到构建目录 $PROJECT_DIR/$BUILD_DIR"
    # 尝试回滚到之前版本
    if [ -d "$BACKUP_DIR/$BACKUP_NAME" ]; then
        echo "正在回滚到之前版本..."
        rm -rf "$DEPLOY_TARGET"
        cp -r "$BACKUP_DIR/$BACKUP_NAME" "$DEPLOY_TARGET"
        echo "已回滚到备份版本"
    fi
    exit 1
fi

# 部署新版本
echo "正在部署新版本..."
# 创建目标目录
mkdir -p "$DEPLOY_TARGET"
# 部署新版本
cp -r "$PROJECT_DIR/$BUILD_DIR/"* "$DEPLOY_TARGET/"
echo "新版本部署完成"
echo ""

# 设置权限
chmod -R 755 "$DEPLOY_TARGET"
echo "权限设置完成"
echo ""

echo "=== 部署成功完成 ==="
echo "部署时间: $(date)"
echo "备份位置: $BACKUP_DIR/$BACKUP_NAME (如需要回滚可使用此备份)"
echo "访问地址: http://localhost/ns-web"