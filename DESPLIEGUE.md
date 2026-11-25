# Guía de despliegue — Banco de Imágenes (uso interno)

La app es de **uso interno**: corre en **una sola máquina de la red** y un único proceso Node
sirve el frontend **y** la API en el mismo puerto. No hay Vercel ni servicios externos.

```
Diseñador (navegador, PC de la oficina)
   │  http://IP-DEL-SERVIDOR:4000   (frontend + /api, mismo origen)
   ▼
Servidor interno (Node: server/ sirve client/dist + API)
   │  escribe/lee
   ▼
\\iis\www\banners\... , popup\...   ← el sitio Hergo.com.ar sigue leyendo de acá
```

- **Base de datos: no hay.** Los datos son archivos en el disco del server:
  `server/usuarios.json`, `server/config.json`, `server/tareas.json` y las imágenes en `\\iis\www`.

---

## Requisitos

- **Node LTS** instalado (https://nodejs.org).
- La máquina/cuenta que corre Node tiene que tener **permiso de escritura en `\\iis\www`**.

## Instalación (una sola vez)

En la raíz del proyecto:

```bash
npm install
```

Instala las dependencias de la raíz, de `server/` y de `client/`.

## Arrancar

```bash
npm start
```

Construye el frontend (`client/dist`) y levanta el server. Debe decir
`Banco de imágenes (HTTP) escuchando en http://localhost:4000`.

- Entrar desde la misma PC: `http://localhost:4000`
- Desde otras PCs de la red: `http://IP-DEL-SERVIDOR:4000` (la IP sale de `ipconfig`).
- Login inicial: **admin / admin123** (obliga a cambiar la contraseña).

Otros comandos:

| Comando          | Qué hace                                                                 |
|------------------|--------------------------------------------------------------------------|
| `npm start`      | Build del frontend + server (producción interna).                        |
| `npm run serve`  | Solo levanta el server, usando el `client/dist` ya construido.           |
| `npm run build`  | Solo construye el frontend.                                              |
| `npm run dev`    | Desarrollo: server con `--watch` + Vite con recarga en `http://localhost:5173`. |

## Firewall

Para que otras PCs lleguen, abrir el puerto en Windows (PowerShell como Administrador):

```powershell
New-NetFirewallRule -DisplayName "Banco Imagenes 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Domain,Private
```

## Configuración opcional (`server/.env`)

Sin `.env` funciona con los valores por defecto. Ver `server/.env.example` para:
`PORT`, `BASE_DIR`, y HTTPS opcional (`SSL_PFX` / `SSL_CERT` + `SSL_KEY`).
Si se configura `SSL_*`, el server pasa a HTTPS en el mismo puerto.

## Dejarlo como servicio

Para que arranque solo al prender la máquina, usar `pm2` o **NSSM**:

- **NSSM:** `nssm install BancoImagenes` → Path: `C:\Program Files\nodejs\npm.cmd`,
  Startup directory: la raíz del proyecto, Arguments: `start`.
  En la pestaña *Log on*, usar una cuenta del dominio con escritura en `\\iis\www`.
- **pm2:** `pm2 start npm --name banco-imagenes -- start` y luego `pm2 save`.

## Checklist

- [ ] Node instalado y `npm install` corrido en la raíz.
- [ ] La cuenta que corre el proceso escribe en `\\iis\www`.
- [ ] Puerto 4000 abierto en el firewall.
- [ ] Corriendo como servicio.
- [ ] Backup de `server/usuarios.json`, `server/config.json` y `server/tareas.json`.
