# Samsung RFID Ident Gate

System sklada sie z dwóch glównych czesci:

- `backend` - serwer Node.js obslugujacy RFID, CDF, RS, konfiguracje i sesje zaladunku
- `Frontend/dashboard` - frontend Next.js z interfejsem operatorskim opartym o Synergy Design System

Repo jest przygotowane pod:

- lokalny development
- budowanie obrazów Dockera
- deployment przez Portainera
- automatyczna publikacje obrazów do GHCR z GitHub Actions

## Struktura

- [backend](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/backend)
- [Frontend/dashboard](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/Frontend/dashboard)
- [deploy/stack.portainer.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/stack.portainer.yml)
- [deploy/.env.stack.example](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/.env.stack.example)
- [docs/docker-ghcr.md](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/docs/docker-ghcr.md)
- [.github/workflows/docker-ghcr.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/.github/workflows/docker-ghcr.yml)

## Wymagania

- Docker Desktop albo Docker Engine
- dla buildów lokalnych Linuxowych: aktywny Linux container engine
- dla deploymentu Windows containers: host Windows z Dockerem w trybie Windows containers
- konto GitHub z dostepem do GHCR

## Lokalne buildy Docker

### Backend Linux

```bash
docker build -t samsung-rfid-backend:local -f backend/Dockerfile backend
```

### Frontend Linux

```bash
docker build -t samsung-rfid-frontend:local -f Frontend/dashboard/Dockerfile Frontend/dashboard
```

### Backend Windows

```powershell
docker build -t samsung-rfid-backend:win -f backend/Dockerfile.windows backend
```

### Frontend Windows

```powershell
docker build -t samsung-rfid-frontend:win -f Frontend/dashboard/Dockerfile.windows Frontend/dashboard
```

## Lokalne uruchomienie Docker

### Backend

```bash
docker run --rm -p 5010:5010 ^
  -e PORT=5010 ^
  -e FTP_LOCAL_ROOT=/ftp-mirror ^
  -v samsung_backend_configuration:/app/data/configuration ^
  -v samsung_backend_logs:/app/data/logs ^
  -v samsung_backend_load_sessions:/app/data/load-sessions ^
  -v C:/FTP_Root/sick:/ftp-mirror:ro ^
  samsung-rfid-backend:local
```

Na Linuxie zamien bind mount na poprawna sciezke, np. `/srv/ftp_root/sick:/ftp-mirror:ro`.

### Frontend

```bash
docker run --rm -p 3000:3000 ^
  -e PORT=3000 ^
  -e API_BASE_URL=http://localhost:5010 ^
  samsung-rfid-frontend:local
```

Frontend generuje runtime config przy starcie kontenera, wiec nie trzeba go przebudowywac przy zmianie adresu backendu.

## Portainer

1. Skopiuj [deploy/.env.stack.example](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/.env.stack.example) do wlasnego pliku env.
2. Ustaw:
   - `GHCR_OWNER`
   - `GHCR_REPOSITORY`
   - `BACKEND_TAG`
   - `FRONTEND_TAG`
   - `FTP_MIRROR_HOST_PATH`
   - opcjonalnie `API_BASE_URL`
3. W Portainerze wybierz `Stacks`.
4. Dodaj nowy stack i wklej zawartosc [deploy/stack.portainer.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/stack.portainer.yml).
5. Podlacz plik env i wdroz stack.

Uwagi:

- stack jest przygotowany pod obrazy Linuxowe
- obrazy Windows sa publikowane osobno do GHCR i wymagaja Windows Docker host
- dla lokalnego fallbacku zdjec FTP zamontuj katalog lustra FTP do `FTP_MIRROR_HOST_PATH`

## GitHub Actions i GHCR

Workflow [docker-ghcr.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/.github/workflows/docker-ghcr.yml) buduje i publikuje obrazy po:

- pushu na `main`
- pushu na `refactor`
- pushu tagu `v*`
- recznym uruchomieniu `workflow_dispatch`

Publikowane obrazy:

- `ghcr.io/<owner>/<repo>-backend`
- `ghcr.io/<owner>/<repo>-frontend`
- `ghcr.io/<owner>/<repo>-backend-windows`
- `ghcr.io/<owner>/<repo>-frontend-windows`

Linux:

- `linux/amd64`
- `linux/arm64`

Windows:

- `windows/amd64`

Wazne:

- Linuxowe buildy dzialaja na GitHub-hosted runnerach
- Windowsowe buildy sa ustawione jako opcjonalne i wymagaja self-hosted runnera z labelami:
  - `self-hosted`
  - `windows`
  - `x64`
  - `docker-windows`
- dodatkowo w repo trzeba ustawic zmienna `ENABLE_WINDOWS_BUILDS=true`
- runner musi miec dzialajacy Docker daemon dla Windows containers

## Jak uruchomic pierwszy pipeline

1. Wypchnij branch `refactor` do zdalnego repo.
2. Wejdz w `Actions` w GitHub.
3. Sprawdz workflow `Build And Publish Containers`.
4. Po sukcesie obrazy beda widoczne w `Packages` repozytorium i w GHCR.

## Ważne uwagi operacyjne

- `backend/node_modules`, logi i sesje zaladunku nie powinny byc commitowane do repo
- konfiguracja produkcyjna powinna byc utrzymywana przez volume lub bind mount, nie przez bake obrazu
- frontend korzysta z `API_BASE_URL` ustawianego w runtime

## Dodatkowa dokumentacja

Szczegoly GHCR, Portainera i tagowania sa opisane tez w [docs/docker-ghcr.md](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/docs/docker-ghcr.md).
