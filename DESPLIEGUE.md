# Guía de despliegue — Banco de Imágenes

Hay dos modos. El **temporal** ya funciona; el **final** se activa cuando esté la regla del router.

---

# MODO TEMPORAL — Tu PC como servidor (HTTP por IP)

Sirve para usar la app YA, mientras se libera el puerto en el router. El mismo proceso
Node sirve el frontend y la API; los demás entran por la IP de tu PC.

**Requisito:** tu PC tiene que poder escribir en `\\iis\www`.

Pasos (en tu PC):
```bash
cd client && npm install && npm run build
cd ../server && npm install
npm start                     # arranca en HTTP en el puerto 4000
```
- NO tiene que existir `server/.env` con variables `SSL_*` (si no, intentaría HTTPS).
- Abrir el puerto 4000 en el Firewall (PowerShell como Administrador):
  ```powershell
  New-NetFirewallRule -DisplayName "Banco Imagenes 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Any
  ```
- Los diseñadores entran a `http://IP-DE-TU-PC:4000` (ej. `http://192.168.1.13:4000`).
- Login inicial: **admin / admin123** (obliga a cambiar la contraseña).
- El frontend se construyó con `VITE_API_BASE_URL` vacío → usa rutas relativas (mismo origen). Correcto para este modo.

> Limitación: mientras la app viva en tu PC, tenés que tenerla prendida y con el server corriendo.

---

# MODO FINAL — Frontend en Vercel + Backend en el servidor (HTTPS)

## Cómo queda la arquitectura

```
Diseñador (navegador)
   │  1) carga la app  ── HTTPS ─────────────►  Vercel  (frontend, client/)
   │  2) llamadas /api ── HTTPS ─────────────►  Servidor interno (backend, server/)
   │                                                   │  escribe/lee
   │                                                   ▼
   │                                            \\iis\www\banners\... , popup\...
   ▼
El sitio (Hergo.com.ar) sigue leyendo las imágenes desde \\iis\www como hoy.
```

- **Frontend (`client/`) → Vercel.** Son archivos estáticos.
- **Backend (`server/`) → servidor interno** con acceso de escritura a `\\iis\www`.
- **Base de datos: no hay.** Los datos se guardan en archivos en el disco del backend:
  `usuarios.json` (usuarios/roles/contraseñas), `config.json` (apps y carpetas) y las
  imágenes en `\\iis\www`. El backend necesita disco persistente (por eso NO va en serverless).

> **Por qué el backend necesita HTTPS:** Vercel sirve la página por HTTPS, y el navegador
> no deja que una página HTTPS llame a un backend HTTP (*mixed content*). Con el certificado
> de la carpeta SSL, el backend sirve HTTPS y el problema se resuelve.

---

## Datos reales de este entorno (ya verificados)

- **Certificado:** `C:\Users\Administrador\Desktop\ssl\certificate.p12` (PKCS12, pass `123456`).
  Emitido por ZeroSSL (CA pública, confiable). Válido para **`portal.hergo.com.ar`**. Vence 12/02/2027.
- **URL del backend (única válida):** `https://portal.hergo.com.ar:8443` (el cert es solo para ese nombre).
- **Servidor del backend (LAN):** `192.168.4.11`, puerto `8443`.
- **`portal.hergo.com.ar` resuelve a `190.3.92.116`** = router MikroTik (salida a internet).
- **Puerto del backend:** `8443` (el 8091 lo usa el proyecto Spring; el 8099, las imágenes/IIS).

## Pendiente de red (Sistemas) — regla NAT en el MikroTik

Falta publicar el 8443 hacia el backend, igual que ya se hace con 8091 y 8099:

> Reenviar **TCP 8443** de la WAN (`190.3.92.116`) → **`192.168.4.11:8443`**.
> MikroTik: chain `dstnat`, protocol `tcp`, dst-port `8443`, action `dst-nat`,
> to-addresses `192.168.4.11`, to-ports `8443`.

Test final (desde una PC, idealmente también desde afuera):
`https://portal.hergo.com.ar:8443/api/yo` → candado válido + `{"error":"No autenticado."}`.

---

## Parte 1 — Servidor (backend)

En la máquina interna que ve `\\iis\www` con permiso de escritura:

1. **Instalar Node LTS** (https://nodejs.org).
2. **Copiar el proyecto** (git clone o copia de la carpeta).
3. Instalar dependencias:
   ```bash
   cd server
   npm install
   ```
4. **Crear `server/.env`** (ver `server/.env.example`):
   ```
   PORT=8443
   CORS_ORIGIN=            # completar en Parte 3 con la URL de Vercel
   BASE_DIR=\\iis\www
   SSL_PFX=C:\Users\Administrador\Desktop\ssl\certificate.p12
   SSL_PASSPHRASE=123456
   ```
5. **Firewall de Windows**: abrir el puerto `8443` (regla de entrada).
6. **NAT en el router**: la regla del MikroTik descrita arriba.
7. **Arrancar** (probar):
   ```bash
   npm start
   ```
   Debe decir `... (HTTPS) escuchando en el puerto 8443`.
8. **Dejarlo como servicio** para que arranque solo (recomendado: `pm2` o **NSSM**).

> Nota: cuando el frontend está en Vercel, el backend NO necesita el build del cliente.
> Igual, si existe `client/dist`, el server lo sirve; es inofensivo.

## Parte 2 — Frontend (Vercel)

1. **Subir el repo a GitHub** (o GitLab/Bitbucket).
2. En Vercel → **Add New Project** → importar el repo.
3. Configurar el proyecto:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. **Environment Variables** (Settings → Environment Variables):
   - `VITE_API_BASE_URL` = `https://portal.hergo.com.ar:8443` (sin barra final).
5. **Deploy.** Vercel te da una URL tipo `https://tu-app.vercel.app`.

## Parte 3 — Conectar los dos

1. Copiar la URL final de Vercel.
2. En el backend, poner esa URL en `CORS_ORIGIN` y **reiniciar** el servicio.
3. Entrar a la URL de Vercel → login inicial **admin / admin123** (obliga a cambiar contraseña).

---

## Sobre acceso interno vs. externo (a definir)

- **Si los diseñadores entran solo desde la oficina:** el DNS del certificado puede resolver a
  la IP interna del backend. La página vive en Vercel (pública), pero las llamadas al backend
  solo funcionarán desde la red interna.
- **Si también entran desde afuera:** el backend tiene que ser alcanzable desde internet
  (DNS público + publicar/redirigir el puerto en el firewall/router). El certificado y el
  nombre deben ser válidos hacia afuera.

Definido esto, se ajusta solo el DNS y el firewall; el código no cambia.

---

## Checklist rápido

- [ ] Cert válido (CA conocida), nombre correcto, DNS apuntando al backend.
- [ ] `server/.env` con `SSL_*`, `CORS_ORIGIN` y `PORT`.
- [ ] Puerto abierto en el firewall.
- [ ] Backend corriendo como servicio y respondiendo por HTTPS.
- [ ] Proyecto en Vercel con Root `client` y `VITE_API_BASE_URL` seteada.
- [ ] `CORS_ORIGIN` del backend = URL de Vercel.
- [ ] Backup de `server/usuarios.json` y `server/config.json` (son "la base de datos").
