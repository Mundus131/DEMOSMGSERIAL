# SID / Ubuntu Post-Install

Ta procedura opisuje konfiguracje panelu `SID160 Pro` / IPC Axiomtek po czystej instalacji Ubuntu 24.04.

## Co ustawia skrypt

Skrypt [deploy/sid-postinstall.sh](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/sid-postinstall.sh):

- instaluje `docker.io`, `docker-compose-v2`, `openssh-server`, `chromium-browser`, `xdotool`
- uruchamia i wlacza `docker` oraz `ssh`
- dodaje uzytkownika `sick` do grupy `docker`
- stawia `Portainer CE`
- ustawia autologin `gdm3`
- wylacza `Wayland` i zostawia `Xorg`
- dodaje poprawki dla `Intel i915`
- usuwa kernel `HWE`, jesli jest zainstalowany, i zostawia stabilny `GA 6.8`
- ustawia kiosk Chromium dla `http://127.0.0.1:3000/dashboard`
- wylacza wygaszacz i blokade ekranu

## Uzycie

Na panelu po zalogowaniu jako `sick`:

```bash
cd /sciezka/do/repo
sudo bash deploy/sid-postinstall.sh
```

Po wykonaniu:

```bash
sudo reboot
```

## Wazne uwagi

### Kernel

Jesli wbudowany ekran miga, trzymaj:

- `linux-image 6.8.x`
- `Xorg`
- poprawki `i915` z pliku `/etc/default/grub.d/99-sid160-display.cfg`

To byl stabilny zestaw na `SID160 Pro`.

### Autologin i kiosk

Skrypt tworzy:

- `/home/sick/.local/bin/start-dashboard-kiosk.sh`
- `/home/sick/.config/autostart/samsung-dashboard.desktop`

Jesli chcesz zmienic URL, ustaw zmienna:

```bash
sudo KIOSK_URL=http://127.0.0.1:3000/dashboard bash deploy/sid-postinstall.sh
```

### Portainer

Domyslnie:

- `https://<IP>:9443`
- `http://<IP>:9000`

### Docker po SSH

Po dodaniu `sick` do grupy `docker` najlepiej rozlaczyc i zalogowac sie ponownie:

```bash
exit
ssh sick@<IP>
```

## Co dalej po post-install

1. Zaloguj Dockera do GHCR, jesli obrazy sa prywatne.
2. Wdroz [deploy/stack.portainer.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/stack.portainer.yml).
3. W UI aplikacji ustaw finalne:
   - port RS (`/dev/ttyS0` / `/dev/ttyS1`)
   - host RFID
   - host CDF
   - FTP user / password
