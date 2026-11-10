#!/usr/bin/env bash
set -euo pipefail

archive="${1:?请提供部署归档路径}"
case "$archive" in
  /tmp/lbsc-deploy-*.tar) ;;
  *) echo "拒绝非预期部署归档路径" >&2; exit 2 ;;
esac

app_dir=/srv/lbsc/app
shared_dir=/srv/lbsc/shared
env_file="$shared_dir/backend.env"
service=lbsc

test -f "$archive"
test -f "$env_file"
test -d "$app_dir"

umask 077
set -a
. "$env_file"
set +a

stamp=$(date +%Y%m%d%H%M%S)
backup_dir="$shared_dir/backups"
mkdir -p "$backup_dir"
cd "$app_dir"

# 在线备份会包含 WAL 中已经提交的数据；密钥另存，恢复时两者必须配套。
node packages/backend/src/backup.js data/app.sqlite "$backup_dir/app-before-deploy-${stamp}.sqlite"
if [ -f data/app.sqlite.key ]; then
  cp data/app.sqlite.key "$backup_dir/app-before-deploy-${stamp}.sqlite.key"
fi

systemctl stop "$service"
trap 'systemctl start "$service" >/dev/null 2>&1 || true' EXIT
tar -xf "$archive" -C "$app_dir"
systemctl start "$service"

for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3101/healthz; then
    trap - EXIT
    exit 0
  fi
  sleep 1
done

echo '服务未在 20 秒内恢复健康。' >&2
exit 1
