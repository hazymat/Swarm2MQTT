#!/usr/bin/env bash
# Install or update Swarm2MQTT as a systemd service.
#   Install:  curl -fsSL https://raw.githubusercontent.com/hazymat/swarm2mqtt/main/scripts/install.sh | sudo bash
#   Dev channel:  ... | sudo bash -s -- --dev
#   Update (run by the app's Update now button):  install.sh --update <tag>
set -euo pipefail
REPO=hazymat/swarm2mqtt DIR=/opt/swarm2mqtt DATA=/var/lib/swarm2mqtt USER_NAME=swarm2mqtt PORT=${SWARM2MQTT_PORT:-8080}
mode=install tag="" channel=stable
while [ $# -gt 0 ]; do case "$1" in --update) mode=update; tag="$2"; shift;; --dev) channel=dev;; esac; shift; done
need_node() { local version; version=$(node -v 2>/dev/null | sed 's/v//') || true; [ -n "$version" ] && [ "$(printf '%s\n22.13.0\n' "$version" | sort -V | head -1)" = "22.13.0" ]; }
if [ -z "$tag" ]; then
  api=https://api.github.com/repos/$REPO/releases
  # read the whole reply first: grep stopping early would make curl fail under pipefail
  if [ "$channel" = dev ]; then releases=$(curl -fsSL "$api") || { echo "Couldn't reach GitHub."; exit 1; }; else releases=$(curl -fsSL "$api/latest" || curl -fsSL "$api") || { echo "Couldn't reach GitHub."; exit 1; }; fi  # no stable release yet: newest dev one
  tag=$(printf '%s\n' "$releases" | grep '"tag_name"' | sed -n 1p | cut -d'"' -f4)
fi
[ -n "$tag" ] || { echo "No release found."; exit 1; }
if [ "$mode" = install ]; then
  [ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }
  if ! need_node; then echo "Installing Node.js 22..."; curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y nodejs >/dev/null; fi
  id "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin "$USER_NAME"
  usermod -aG dialout "$USER_NAME" 2>/dev/null || true
  mkdir -p "$DIR/releases" "$DATA"; chown -R "$USER_NAME:$USER_NAME" "$DIR" "$DATA"
fi
target="$DIR/releases/$tag"
if [ ! -f "$target/dist/main.js" ]; then
  rm -rf "$target.tmp"; mkdir -p "$target.tmp"
  # fresh installs fetch the -install copy (counted as installs on the website); updates and older releases the plain one
  base_url="https://github.com/$REPO/releases/download/$tag/swarm2mqtt-$tag"
  if [ "$mode" = install ] && curl -fsSL "$base_url-install.tar.gz" -o "$target.tmp/release.tar.gz" 2>/dev/null; then :; else curl -fsSL "$base_url.tar.gz" -o "$target.tmp/release.tar.gz"; fi
  tar -xzf "$target.tmp/release.tar.gz" -C "$target.tmp"; rm -f "$target.tmp/release.tar.gz"
  (cd "$target.tmp" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)
  mv "$target.tmp" "$target"
fi
cp "$target/scripts/install.sh" "$DIR/install.sh" 2>/dev/null || true
ln -sfn "$target" "$DIR/current"
# keep the newest 3 versions
ls -1dt "$DIR"/releases/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
if [ "$mode" = install ]; then
  chown -R "$USER_NAME:$USER_NAME" "$DIR"
  cat > /etc/systemd/system/swarm2mqtt.service <<UNIT
[Unit]
Description=Swarm2MQTT (Zigbee2MQTT, but sensible)
After=network-online.target
Wants=network-online.target
[Service]
User=$USER_NAME
WorkingDirectory=$DATA
ExecStart=/usr/bin/env node $DIR/current/dist/main.js --data $DATA --port $PORT
Restart=always
RestartSec=2
Environment=SWARM2MQTT_INSTALL_DIR=$DIR
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload; systemctl enable --now swarm2mqtt
  echo "Swarm2MQTT $tag is running: http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
else
  # run by hand as root: give the files back to the service and restart it (the app's own Update now restarts itself)
  if [ "$(id -u)" = 0 ]; then chown -R "$USER_NAME:$USER_NAME" "$DIR"; systemctl restart swarm2mqtt; fi
  echo "Updated to $tag"
fi
