#!/usr/bin/env bash
set -euo pipefail

install_dir="${1:?Usage: install-mihomo.sh INSTALL_DIR}"
mkdir -p "$install_dir"
archive="$(mktemp "$install_dir/mihomo.XXXXXX.gz")"
trap 'rm -f "$archive"' EXIT

# Pin the compatible CPU build and its official GitHub release asset digest.
curl -fsSL --retry 3 --max-time 120 \
  https://github.com/MetaCubeX/mihomo/releases/download/v1.19.32/mihomo-linux-amd64-compatible-v1.19.32.gz \
  -o "$archive"
printf '%s  %s\n' ba3ce607747a07f948fc35780e108a4a7c7f552a38b9bd4d115f313ebcb89c20 "$archive" | sha256sum -c -
gzip -dc "$archive" > "$install_dir/mihomo"
chmod +x "$install_dir/mihomo"
"$install_dir/mihomo" -v
