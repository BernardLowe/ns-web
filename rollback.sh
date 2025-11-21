#!/bin/bash

# 回滚脚本：将NS-WEB应用回滚到之前的备份版本

set -e  # 遇到错误时退出

# 配置变量
DEPLOY_TARGET="/usr/local/openresty/nginx/html/ns-web"
BACKUP_DIR="/tmp/ns-web-backups"

echo "=== NS-WEB 回滚脚本 ==="
echo "部署目标: $DEPLOY_TARGET"
echo "备份目录: $BACKUP_DIR"
echo ""

# 检查备份目录是否存在
if [ ! -d "$BACKUP_DIR" ]; then
    echo "错误: 备份目录 $BACKUP_DIR 不存在"
    exit 1
fi

# 列出可用的备份
echo "可用的备份版本:"
backups=($(ls -td "$BACKUP_DIR"/ns-web-backup-* 2>/dev/null)) || true

if [ ${#backups[@]} -eq 0 ]; then
    echo "错误: 未找到任何备份"
    exit 1
fi

# 显示备份列表
for i in "${!backups[@]}"; do
    backup_name=$(basename "${backups[$i]}")
    echo "$((i+1)). $backup_name"
done

echo ""
read -p "请选择要回滚到的版本编号 (1-${#backups[@]}): " choice

# 验证用户输入
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt ${#backups[@]} ]; then
    echo "错误: 无效的选择"
    exit 1
fi

SELECTED_BACKUP="${backups[$((choice-1))]}"
echo ""
echo "正在回滚到版本: $(basename "$SELECTED_BACKUP")"

# 执行回滚
echo "删除当前版本..."
rm -rf "$DEPLOY_TARGET"

echo "部署选定的备份版本..."
cp -r "$SELECTED_BACKUP" "$DEPLOY_TARGET"

# 设置权限
chmod -R 755 "$DEPLOY_TARGET"

echo ""
echo "=== 回滚成功完成 ==="
echo "已回滚到: $(basename "$SELECTED_BACKUP")"
echo "部署时间: $(date)"