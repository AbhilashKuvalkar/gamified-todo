# Deploying Quest Log (Gamified Todo) to IIS under `/UBMV`

The client and the server are built **separately** and deployed side by side under one parent
folder, `C:\inetpub\wwwroot\UBMV`:

```
C:\inetpub\wwwroot\UBMV\            ← parent folder (not served directly)
├── client\
│   └── dist\                       ← child 1: React build  → physical path of IIS application "UBMV"
│       ├── web.config
│       ├── index.html
│       └── assets\
└── server\                         ← child 2: Node API     → run by the Windows service
    ├── server.js
    ├── src\
    ├── node_modules\
    ├── data\todo.db
    └── logs\service.log
```

| Part | Source | Deployed to | Run by |
|---|---|---|---|
| **UI** (React) | `client/dist/` (build output) | `C:\inetpub\wwwroot\UBMV\client\dist\` | IIS application `UBMV` (static files) |
| **API** (Node + SQLite) | `server/` (no build step) | `C:\inetpub\wwwroot\UBMV\server\` | Windows service (NSSM) on `127.0.0.1:3001` |

```
Browser ──► IIS application "UBMV"  →  physical path UBMV\client\dist
             ├── /UBMV/, /UBMV/assets/*  → static files served by IIS
             ├── /UBMV/<any other route> → index.html (SPA fallback)
             └── /UBMV/api/*             → URL Rewrite + ARR reverse proxy
                                              ▼
                                Node API service  http://127.0.0.1:3001/UBMV/api/*
                                (UBMV\server, database in server\data\todo.db)
```

- The IIS application `UBMV` points at **`UBMV\client\dist`**, not at the parent folder. That keeps
  the URL `https://<server>/UBMV/` while the parent folder holds both halves.
- Because the `/UBMV` URL space belongs to the application (mapped to `client\dist`), the sibling
  `server` folder – code, database and logs – has **no URL** and can never be served by IIS.
- The `/UBMV` prefix is kept end to end: the React build uses it as its base path, IIS forwards
  API calls unchanged, and Express mounts the API on `BASE_PATH + /api` = `/UBMV/api`.
- Node listens on **loopback only**, so the API is reachable only through IIS.

---

## 1. Server prerequisites (one time)

1. **IIS** with the default *Web Server* role (Static Content is included). No ASP.NET needed.
2. **Node.js 22.13+ LTS (x64)** in `C:\Program Files\nodejs\` (Node 24 LTS also works).
   The API uses Node's built-in SQLite driver (`node:sqlite`) – **no native modules to compile**.
   Verify with `node -v` in a new prompt.
3. **IIS URL Rewrite 2.1** – https://www.iis.net/downloads/microsoft/url-rewrite
4. **Application Request Routing 3.0** – https://www.iis.net/downloads/microsoft/application-request-routing
5. **NSSM** to run Node as a Windows service – https://nssm.cc/download
   Extract `win64\nssm.exe` to e.g. `C:\Tools\nssm\` and add that folder to `PATH`.
   *(No third-party tools allowed? See [Running Node without NSSM](#alternative-running-node-without-nssm).)*

### Enable the ARR proxy (server level, one time)

ARR is installed with proxying **off**; without this, every `/UBMV/api` call returns 404.

IIS Manager → click the **server node** → **Application Request Routing Cache** →
**Server Proxy Settings…** → tick **Enable proxy** → **Apply**. Or (elevated):

```bat
%windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:"True" /commit:apphost
```

---

## 2. Build (dev machine / build agent)

### Client

```bash
cd client
npm ci
npm run build          # → client/dist
```

`client/dist` is the complete IIS folder:

```
client/dist/
├── web.config      ← proxy rule for /api, SPA fallback, caching (copied from client/public)
├── index.html
└── assets/         ← content-hashed JS/CSS
```

To host under a different application name, build with `VITE_BASE_PATH`
(PowerShell: `$env:VITE_BASE_PATH="/Todo"; npm run build`) – see [Configuration](#configuration).

### Server

There's nothing to compile. Deploy these files from `server/`:

```
server.js
src\            (api.js, db.js, gamification.js)
package.json
package-lock.json
```

---

## 3. Deploy the API

All commands below are for an **elevated** prompt (PowerShell or Command Prompt). Paths are
written out in full on purpose – don't swap them for `%VAR%` / `$var` variables, or NSSM may
store the unexpanded text as the path.

### 3a. Copy files and install dependencies

```powershell
# run from the project root (the folder that contains client\ and server\)
robocopy server C:\inetpub\wwwroot\UBMV\server /E /XD node_modules data logs
cd C:\inetpub\wwwroot\UBMV\server
npm ci --omit=dev
mkdir C:\inetpub\wwwroot\UBMV\server\data
mkdir C:\inetpub\wwwroot\UBMV\server\logs
```

> No internet access on the server? Run `npm ci --omit=dev` inside `server/` on the build
> machine and copy `node_modules` along with the rest – the only dependency (Express) is pure
> JavaScript, so it works on any OS.

Check the entry point is where the service expects it:

```powershell
Test-Path "C:\inetpub\wwwroot\UBMV\server\server.js"      # → True
```

### 3b. Folder permissions

The service runs as the built-in **LocalService** account. Grant access **before** creating the
service – if it can't open the folder, Windows refuses to start it with
*"CreateProcess() failed: The directory name is invalid"*.

```powershell
icacls "C:\inetpub\wwwroot\UBMV\server"      /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)RX"
icacls "C:\inetpub\wwwroot\UBMV\server\data" /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)M"
icacls "C:\inetpub\wwwroot\UBMV\server\logs" /grant "NT AUTHORITY\LOCAL SERVICE:(OI)(CI)M"
```

### 3c. Create the Windows service (NSSM)

```powershell
nssm install UBMV-Node "C:\Program Files\nodejs\node.exe" server.js
nssm set UBMV-Node AppDirectory "C:\inetpub\wwwroot\UBMV\server"
nssm set UBMV-Node AppEnvironmentExtra PORT=3001 HOST=127.0.0.1 BASE_PATH=/UBMV NODE_ENV=production
nssm set UBMV-Node DisplayName "UBMV Quest Log API (Node.js)"
nssm set UBMV-Node Description "Gamified Todo API, reverse-proxied by IIS at /UBMV/api"
nssm set UBMV-Node Start SERVICE_AUTO_START
nssm set UBMV-Node AppExit Default Restart
nssm set UBMV-Node AppRestartDelay 5000
nssm set UBMV-Node AppStdout "C:\inetpub\wwwroot\UBMV\server\logs\service.log"
nssm set UBMV-Node AppStderr "C:\inetpub\wwwroot\UBMV\server\logs\service.log"
nssm set UBMV-Node AppRotateFiles 1
nssm set UBMV-Node AppRotateOnline 1
nssm set UBMV-Node AppRotateBytes 10485760

# Run with the low-privilege built-in account instead of LocalSystem
sc.exe config UBMV-Node obj= "NT AUTHORITY\LocalService" password= ""
```

This starts the API with Windows, restarts it 5 s after any crash, logs to
`logs\service.log` (rotated at 10 MB), and guarantees a single process owns the SQLite file.

### 3d. Start and verify the API on its own

```powershell
nssm get UBMV-Node AppDirectory                             # → C:\inetpub\wwwroot\UBMV\server
nssm start UBMV-Node
Invoke-RestMethod http://127.0.0.1:3001/UBMV/api/health     # → status: ok
```

---

## 4. Deploy the UI

### 4a. Copy the client build

Mirror the build into `UBMV\client\dist` (run from the project root, after `npm run build`):

```powershell
robocopy client\dist C:\inetpub\wwwroot\UBMV\client\dist /MIR
```

`/MIR` makes the target an exact copy of the build (old hashed assets are removed). It only
touches `UBMV\client\dist`, never `UBMV\server`.

```powershell
Test-Path "C:\inetpub\wwwroot\UBMV\client\dist\web.config"    # → True
Test-Path "C:\inetpub\wwwroot\UBMV\client\dist\index.html"    # → True
```

### 4b. Create the IIS application

The application is named `UBMV` but its **physical path is the child folder `client\dist`**.

IIS Manager:

1. **Application Pools → Add Application Pool** – Name `UBMV`, .NET CLR version **No Managed Code**.
2. **Sites → Default Web Site** → right-click the site → **Add Application…**
   - Alias: **`UBMV`** (must match the build's base path and `BASE_PATH`)
   - Application pool: `UBMV`
   - Physical path: **`C:\inetpub\wwwroot\UBMV\client\dist`**

> Don't use *Convert to Application* on the `UBMV` folder – that would make the **parent**
> folder the application root, where there is no `index.html` or `web.config`.

Or from an elevated PowerShell:

```powershell
Import-Module WebAdministration
New-WebAppPool -Name "UBMV"
Set-ItemProperty IIS:\AppPools\UBMV -Name managedRuntimeVersion -Value ""
New-WebApplication -Site "Default Web Site" -Name "UBMV" `
  -PhysicalPath "C:\inetpub\wwwroot\UBMV\client\dist" -ApplicationPool "UBMV"
```

**Already created the application on the parent folder?** Just repoint it:

```powershell
Set-ItemProperty "IIS:\Sites\Default Web Site\UBMV" -Name physicalPath `
  -Value "C:\inetpub\wwwroot\UBMV\client\dist"
```

(IIS Manager: select the `UBMV` application → **Basic Settings…** → Physical path.)

No extra permissions are needed for the UI: IIS only reads static files from `client\dist`, and
the default `IIS_IUSRS` read access inherited from `C:\inetpub\wwwroot` covers that.

### What `web.config` does

| Rule | Matches | Action |
|---|---|---|
| `ApiReverseProxy` | `/UBMV/api` and `/UBMV/api/*` | Proxy to `http://127.0.0.1:3001{UNENCODED_URL}` – original path + query string, `/UBMV` prefix included |
| `StaticFiles` | any existing file/folder | Served by IIS directly |
| `SpaFallback` | everything else | Rewritten to `index.html` |

It also sets a one-year cache on `assets/` (file names are content-hashed) and no-cache on
`index.html`, so a new deployment is picked up on the next page load.

## 5. Verify end to end

```powershell
Invoke-RestMethod http://localhost/UBMV/api/health    # API through IIS → status: ok
start http://localhost/UBMV/
```

Add a task and tick it off – you should see a "+25 XP" toast and the XP bar move.

---

## Configuration

**API** – environment variables on the service:

| Variable    | Default              | Purpose |
|-------------|----------------------|---------|
| `PORT`      | `3001`               | Local port – must match the port in the UI's `web.config` |
| `HOST`      | `127.0.0.1`          | Keep on loopback so the API is only reachable via IIS |
| `BASE_PATH` | `/UBMV`              | API is mounted on `BASE_PATH/api` |
| `DB_PATH`   | `<app>\data\todo.db` | Database location |
| `NODE_ENV`  | `production`         | |

```powershell
nssm set UBMV-Node AppEnvironmentExtra PORT=3001 HOST=127.0.0.1 BASE_PATH=/UBMV NODE_ENV=production
nssm restart UBMV-Node
```

(`AppEnvironmentExtra` replaces the whole list, so always pass every variable.)

**UI** – build time only: `VITE_BASE_PATH` (default `/UBMV`).

**Changing the port:** set `PORT` on the service **and** edit the port in
`client/public/web.config` (or directly in `C:\inetpub\wwwroot\UBMV\client\dist\web.config`).

**Hosting under a different application name** (e.g. `/Todo`):
1. Rebuild the UI with `VITE_BASE_PATH=/Todo` and deploy it to the new IIS application folder.
2. Set `BASE_PATH=/Todo` on the service and restart it.
3. Create the IIS application with alias `Todo`. `web.config` needs no change.

---

## Updating

**UI only** – no restart needed; users get the new version on their next page load:

```powershell
robocopy client\dist C:\inetpub\wwwroot\UBMV\client\dist /MIR
```

**API** – the service does not pick up file changes, so stop it first:

```powershell
nssm stop UBMV-Node
robocopy server C:\inetpub\wwwroot\UBMV\server /E /XD node_modules data logs
cd C:\inetpub\wwwroot\UBMV\server; npm ci --omit=dev        # only if package.json changed
nssm start UBMV-Node
```

The `/XD data logs` switch keeps the database and logs untouched.

## Backup

All state is in `C:\inetpub\wwwroot\UBMV\server\data\todo.db` (plus `todo.db-wal` / `todo.db-shm` while
running). Stop the service and copy the `data` folder, or copy all three files together.

## Useful service commands

```powershell
nssm status  UBMV-Node
nssm restart UBMV-Node
nssm edit    UBMV-Node          # GUI editor for all settings
nssm remove  UBMV-Node confirm
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Service won't start: *"CreateProcess() failed: The directory name is invalid"* | `AppDirectory` is wrong or LocalService can't open it. Run `nssm get UBMV-Node AppDirectory` – if it shows `%APP%`, `$app` or a missing path, fix it with `nssm set UBMV-Node AppDirectory "C:\inetpub\wwwroot\UBMV\server"` (same for `AppStdout`/`AppStderr`). Otherwise re-run the `icacls` grants in 3b. To tell the two apart, start once as LocalSystem (`sc.exe config UBMV-Node obj= LocalSystem`): if it starts, it's permissions. Switch back to LocalService afterwards. |
| UI loads, but every API call returns **404** (IIS HTML page) | ARR proxy not enabled – see section 1. |
| API calls return **502.3 Bad Gateway** | The API service isn't running or uses another port. `nssm status UBMV-Node`, check `C:\inetpub\wwwroot\UBMV\server\logs\service.log`, and test `http://127.0.0.1:3001/UBMV/api/health` on the server. |
| **502.3** with `0x80072ee2` | Timeout – the API is hung. Restart the service and check the log. |
| **500.19** mentioning `rewrite` | URL Rewrite isn't installed – install it and run `iisreset`. |
| Log shows `EADDRINUSE` | Another process uses port 3001 – pick another `PORT` and update `web.config`. |
| Log shows `No such built-in module: node:sqlite` | Node is older than 22.13 – upgrade Node. |
| `SQLITE_CANTOPEN` / `attempt to write a readonly database` | LocalService lacks Modify on `data\` (3b). |
| `/UBMV/` returns **403.14** (directory listing denied) or 404, and `/UBMV/api` 404s | The IIS application points at the parent folder `UBMV` instead of `UBMV\client\dist`. Repoint its physical path (4b). |
| Blank page; `/UBMV/assets/*.js` returns 404 | IIS alias doesn't match the build's base path, or the build was copied one level too deep (e.g. `client\dist\dist`). Alias must be `UBMV` and `index.html` must sit directly in `C:\inetpub\wwwroot\UBMV\client\dist`. |
| `/UBMV/some/page` returns 404 on refresh | `web.config` is missing from the UI folder – it must be copied with the rest of `client/dist`. |
| API returns JSON `Not found. API routes live under /UBMV/api/` | The request reached Node with the wrong path – check the URL and `BASE_PATH`. |
| PATCH/DELETE return **405** | WebDAV is intercepting verbs. Remove the *WebDAV Publishing* feature, or its module and handler for this application. |

---

## Alternative: running Node without NSSM

If third-party tools aren't allowed, use Task Scheduler (elevated PowerShell):

```powershell
$cmd = '/c set PORT=3001&& set HOST=127.0.0.1&& set BASE_PATH=/UBMV&& set NODE_ENV=production&& ' +
       '"C:\Program Files\nodejs\node.exe" server.js >> logs\service.log 2>&1'
$action    = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmd -WorkingDirectory "C:\inetpub\wwwroot\UBMV\server"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\LOCALSERVICE" -LogonType ServiceAccount
$settings  = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
             -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "UBMV-Node" -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings
Start-ScheduledTask -TaskName "UBMV-Node"
```

NSSM is still preferred: it restarts on crash immediately and rotates logs.
