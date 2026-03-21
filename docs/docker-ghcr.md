# Docker, GHCR i Portainer

## Co jest przygotowane

- Linuxowe obrazy `backend` i `frontend` pod `linux/amd64` oraz `linux/arm64`
- osobne obrazy Windows pod `windows/amd64`
- publikacja do `GHCR`
- stack dla Portainera w [deploy/stack.portainer.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/stack.portainer.yml)

## Nazwy obrazów w GHCR

- `ghcr.io/<OWNER>/<REPO>-backend`
- `ghcr.io/<OWNER>/<REPO>-frontend`
- `ghcr.io/<OWNER>/<REPO>-backend-windows`
- `ghcr.io/<OWNER>/<REPO>-frontend-windows`

Przykład dla repo `Mundus131/DEMOSMGSERIAL`:

- `ghcr.io/mundus131/demosmgserial-backend`
- `ghcr.io/mundus131/demosmgserial-frontend`

## Kiedy buildy się uruchamiają

Workflow w [docker-ghcr.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/.github/workflows/docker-ghcr.yml) startuje po:

- pushu na `main`
- pushu na `refactor`
- pushu tagu `v*`
- ręcznym `workflow_dispatch`

## Windows buildy

Windows buildy nie sa uruchamiane na zwyklym GitHub-hosted runnerze. W workflow sa celowo przepiete na self-hosted runner Windows z Dockerem dla Windows containers.

Wymagania:

- self-hosted runner z labelami:
  - `self-hosted`
  - `windows`
  - `x64`
  - `docker-windows`
- wlaczona zmienna repozytorium `ENABLE_WINDOWS_BUILDS=true`
- aktywny Docker daemon dla Windows containers

Bez tego job Windows nie wystartuje, co jest zamierzone i bezpieczniejsze niz czerwony pipeline na GitHub-hosted runnerze bez `docker_engine`.

## Jak przygotować repo na GitHubie

1. Wypchnij branch i pliki workflow do zdalnego repo.
2. Wejdź w `Settings -> Actions -> General` i upewnij się, że workflowy są włączone.
3. GHCR używa `GITHUB_TOKEN`, więc nie trzeba dodawać osobnego sekretu do logowania.
4. Jeśli chcesz, żeby obrazy były publiczne, ustaw widoczność pakietów GHCR na `public`.

## Tagi obrazów

Workflow publikuje:

- tag brancha, np. `main` albo `refactor`
- tag `sha-<commit>`
- tag `latest` tylko dla domyślnej gałęzi

## Portainer

Skopiuj [deploy/.env.stack.example](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/.env.stack.example) do własnego pliku env i uzupełnij:

- `GHCR_OWNER`
- `GHCR_REPOSITORY`
- `FTP_MIRROR_HOST_PATH`

Uwaga:

- w GHCR trzymaj `owner` i `repository` w lowercase w pliku env

Ważne:

- stack jest przygotowany pod Linuxowe obrazy i Linuxowy node Dockera
- dla Windowsowych kontenerów obrazy są publikowane, ale deployment trzeba robić na Windows Docker host
- jeśli chcesz korzystać z lokalnego fallbacku zdjęć FTP, zamontuj katalog lustra FTP do `FTP_MIRROR_HOST_PATH`

## Przykładowe wdrożenie w Portainerze

1. `Stacks -> Add stack`
2. wklej zawartość [deploy/stack.portainer.yml](/C:/SICK/EHUB/RAW_APPS/SAMSUNG_DEMO/deploy/stack.portainer.yml)
3. ustaw wartości z pliku env
4. deploy

## Ręczny build lokalny

### Linux backend

```bash
docker build -t samsung-rfid-backend:local -f backend/Dockerfile backend
```

### Linux frontend

```bash
docker build -t samsung-rfid-frontend:local -f Frontend/dashboard/Dockerfile Frontend/dashboard
```

### Windows backend

```powershell
docker build -t samsung-rfid-backend:win -f backend/Dockerfile.windows backend
```

### Windows frontend

```powershell
docker build -t samsung-rfid-frontend:win -f Frontend/dashboard/Dockerfile.windows Frontend/dashboard
```

## Runtime API frontendu

Frontend generuje `public/runtime-config.js` przy starcie kontenera.

Możesz ustawić:

- `API_BASE_URL=http://twoj-host:5010`

Jeśli zmienna nie jest ustawiona, frontend zachowa dotychczasowy fallback oparty o hostname przeglądarki.
