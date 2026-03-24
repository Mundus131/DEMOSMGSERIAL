#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-sick}"
APP_GROUP="${APP_GROUP:-docker}"
PORTAINER_NAME="${PORTAINER_NAME:-portainer}"
PORTAINER_IMAGE="${PORTAINER_IMAGE:-portainer/portainer-ce:lts}"
PORTAINER_HTTP_PORT="${PORTAINER_HTTP_PORT:-9000}"
PORTAINER_HTTPS_PORT="${PORTAINER_HTTPS_PORT:-9443}"
KIOSK_URL="${KIOSK_URL:-http://127.0.0.1:3000/dashboard}"
DISPLAY_MODE="${DISPLAY_MODE:-xorg}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Uruchom ten skrypt jako root: sudo bash deploy/sid-postinstall.sh"
  exit 1
fi

if ! id "${APP_USER}" >/dev/null 2>&1; then
  echo "Uzytkownik ${APP_USER} nie istnieje."
  exit 1
fi

echo "[1/8] Instalacja pakietow systemowych"
apt-get update
apt-get install -y \
  docker.io \
  docker-compose-v2 \
  openssh-server \
  chromium-browser \
  xdotool \
  curl

systemctl enable --now ssh
systemctl enable --now docker
usermod -aG "${APP_GROUP}" "${APP_USER}"

echo "[2/8] Portainer"
docker rm -f "${PORTAINER_NAME}" >/dev/null 2>&1 || true
docker volume create portainer_data >/dev/null
docker run -d \
  --name "${PORTAINER_NAME}" \
  --restart unless-stopped \
  -p "${PORTAINER_HTTP_PORT}:9000" \
  -p "${PORTAINER_HTTPS_PORT}:9443" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  "${PORTAINER_IMAGE}"

echo "[3/8] Stabilizacja ekranu Intel / Xorg"
mkdir -p /etc/default/grub.d
cat >/etc/default/grub.d/99-sid160-display.cfg <<'EOF'
GRUB_CMDLINE_LINUX_DEFAULT="$GRUB_CMDLINE_LINUX_DEFAULT i915.enable_psr=0 i915.enable_fbc=0 i915.enable_dc=0"
EOF

mkdir -p /etc/X11/xorg.conf.d
cat >/etc/X11/xorg.conf.d/20-intel_flicker_fix.conf <<'EOF'
Section "Device"
  Identifier "Intel Graphics"
  Driver "intel"
  Option "TripleBuffer" "true"
  Option "TearFree" "true"
EndSection
EOF

if [[ "${DISPLAY_MODE}" == "xorg" ]]; then
  sed -i 's/^#\?WaylandEnable=.*/WaylandEnable=false/' /etc/gdm3/custom.conf
fi

sed -i 's/^#\?AutomaticLoginEnable.*/AutomaticLoginEnable=true/' /etc/gdm3/custom.conf
sed -i "s/^#\\?AutomaticLogin=.*/AutomaticLogin=${APP_USER}/" /etc/gdm3/custom.conf

if dpkg -l | grep -q '^ii  linux-image-generic-hwe-24.04'; then
  echo "[4/8] Usuwanie HWE kernela i zostawienie GA 6.8"
  apt-get purge -y linux-generic-hwe-24.04 linux-image-generic-hwe-24.04 linux-headers-generic-hwe-24.04 || true
fi

update-grub

echo "[5/8] Ustawienia sesji uzytkownika"
runuser -l "${APP_USER}" -c "mkdir -p ~/.config/autostart ~/.local/bin ~/snap/chromium/common/kiosk-profile"

runuser -l "${APP_USER}" -c "dbus-launch gsettings set org.gnome.desktop.session idle-delay 0" || true
runuser -l "${APP_USER}" -c "dbus-launch gsettings set org.gnome.desktop.screensaver lock-enabled false" || true
runuser -l "${APP_USER}" -c "dbus-launch gsettings set org.gnome.desktop.screensaver ubuntu-lock-on-suspend false" || true
runuser -l "${APP_USER}" -c "dbus-launch gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'" || true
runuser -l "${APP_USER}" -c "dbus-launch gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing'" || true

echo "[6/8] Skrypt kiosk"
cat >"/home/${APP_USER}/.local/bin/start-dashboard-kiosk.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export DISPLAY=:0
export XDG_RUNTIME_DIR=/run/user/\$(id -u)
export DBUS_SESSION_BUS_ADDRESS="unix:path=\${XDG_RUNTIME_DIR}/bus"

BROWSER=""
for candidate in chromium-browser /snap/bin/chromium chromium google-chrome google-chrome-stable; do
  if command -v "\$candidate" >/dev/null 2>&1; then
    BROWSER="\$candidate"
    break
  fi
done
[ -n "\$BROWSER" ] || exit 1

APP_URL="${KIOSK_URL}"
PROFILE_DIR="\$HOME/snap/chromium/common/kiosk-profile"
mkdir -p "\$PROFILE_DIR"
rm -f "\$PROFILE_DIR"/SingletonLock "\$PROFILE_DIR"/SingletonSocket "\$PROFILE_DIR"/SingletonCookie 2>/dev/null || true

for _ in \$(seq 1 120); do
  if curl -fsS "\$APP_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

xset s off || true
xset -dpms || true
xset s noblank || true

pkill -f '/snap/chromium/.*/chrome' || true
pkill -f 'chromium-browser' || true
sleep 3

nohup "\$BROWSER" \\
  --user-data-dir="\$PROFILE_DIR" \\
  --new-window \\
  --no-first-run \\
  --no-default-browser-check \\
  --disable-session-crashed-bubble \\
  --disable-infobars \\
  --overscroll-history-navigation=0 \\
  --disable-features=Translate,MediaRouter \\
  --start-maximized \\
  about:blank >"\$HOME/kiosk-browser.log" 2>&1 &

WINDOW_ID=""
for _ in \$(seq 1 60); do
  sleep 1
  xdotool key Escape >/dev/null 2>&1 || true
  WINDOW_ID=\$(xdotool search --onlyvisible --class Chromium 2>/dev/null | head -n 1 || true)
  if [ -n "\$WINDOW_ID" ]; then
    break
  fi
done

if [ -n "\$WINDOW_ID" ]; then
  xdotool windowactivate --sync "\$WINDOW_ID" >/dev/null 2>&1 || true
  sleep 1
  xdotool key --clearmodifiers ctrl+l >/dev/null 2>&1 || true
  sleep 0.5
  xdotool type --delay 20 "\$APP_URL" >/dev/null 2>&1 || true
  sleep 0.3
  xdotool key Return >/dev/null 2>&1 || true

  for _ in \$(seq 1 20); do
    sleep 1
    name=\$(xdotool getwindowname "\$WINDOW_ID" 2>/dev/null || true)
    if [[ -n "\$name" && "\$name" != "Untitled - Chromium" ]]; then
      break
    fi
  done

  xdotool windowactivate --sync "\$WINDOW_ID" >/dev/null 2>&1 || true
  sleep 1
  xdotool key --clearmodifiers F11 >/dev/null 2>&1 || true
fi

wait
EOF

chown "${APP_USER}:${APP_USER}" "/home/${APP_USER}/.local/bin/start-dashboard-kiosk.sh"
chmod +x "/home/${APP_USER}/.local/bin/start-dashboard-kiosk.sh"

cat >"/home/${APP_USER}/.config/autostart/samsung-dashboard.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=Samsung RFID Dashboard Kiosk
Exec=/bin/bash -lc 'sleep 6; /home/${APP_USER}/.local/bin/start-dashboard-kiosk.sh'
X-GNOME-Autostart-enabled=true
Terminal=false
NoDisplay=false
EOF

chown "${APP_USER}:${APP_USER}" "/home/${APP_USER}/.config/autostart/samsung-dashboard.desktop"

echo "[7/8] Informacje koncowe"
echo "Portainer: https://<IP_HOSTA>:${PORTAINER_HTTPS_PORT}"
echo "HTTP Portainer: http://<IP_HOSTA>:${PORTAINER_HTTP_PORT}"
echo "Docker: systemctl status docker"
echo "SSH: systemctl status ssh"

echo "[8/8] Gotowe"
echo "Zalecany restart: sudo reboot"
