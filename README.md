# Banco de Imágenes — puente Diseño ↔ Aplicaciones

App interna (React + Node) para que el equipo de marketing/diseño **agregue, edite y elimine**
las imágenes que consumen las aplicaciones, sin depender de los programadores.

## Cómo funciona

- **Administrador:** define el árbol `Aplicación → Página → Sección (PC / banner / popup / …)`
  y a qué **carpeta destino** del servidor apunta cada sección. Se guarda en `server/config.json`.
- **Usuario (diseñador):** elige app → página → sección, ve las imágenes actuales de esa carpeta
  y puede subir nuevas, reemplazar, renombrar o eliminar. Los archivos van directo a la carpeta
  predeterminada del servidor.
- Sin login (uso en red interna).

## Estructura

```
server/   -> API Node/Express (maneja archivos y config)
client/   -> Frontend React (Vite)
banco/    -> Carpeta base donde viven las imágenes (configurable)
```

## Puesta en marcha

Desde la raíz del proyecto:

```bash
npm install     # una sola vez: instala raíz, server/ y client/
npm start       # construye el frontend y levanta el server (frontend + API)
```

Abrir http://localhost:4000 (o `http://IP-DE-LA-PC:4000` desde otras PCs de la red).

Para desarrollo con recarga en caliente: `npm run dev` (server + Vite) y abrir http://localhost:5173.

Todo corre en **una sola máquina** de la red interna (la que tenga acceso de escritura
a `\\iis\www`). Detalle de firewall, servicio y HTTPS opcional en `DESPLIEGUE.md`.

## Configuración importante

- `server/config.json`:
  - `baseDir`: carpeta base en el servidor. Actual: `\\iis\www`.
  - `publicBaseUrl`: base del enlace público. Actual: `https://portal.hergo.com.ar:8099/Imagenes/www/`.
  - Secciones de Hergo.com.ar: `banners/mobile`, `banners/pc`, `popup` (relativas a `baseDir`).
- El backend bloquea rutas con `..`; nunca se puede escribir fuera del recurso `\\iis\www`.
- Extensiones permitidas: jpg, jpeg, png, gif, webp, svg, avif, bmp. Límite 25 MB por archivo.

## Usuarios y roles

- Al primer arranque, si no hay usuarios, se crea un administrador inicial:
  - **usuario:** `admin` — **contraseña temporal:** `admin123`
  - En el primer ingreso obliga a cambiar la contraseña.
- Roles:
  - **usuario:** solo la pantalla "Cargar imágenes" (agregar, reemplazar y eliminar).
  - **administrador:** además "Configuración" (rutas, apps, secciones) y "Usuarios".
- Los datos se guardan en `server/usuarios.json` (contraseñas con hash scrypt + salt) y el token
  se firma con el secreto de `server/.secret`. **Ambos se generan solos y NO deben compartirse ni
  versionarse.** Para reiniciar el admin inicial, borrá `usuarios.json` y volvé a arrancar.

## Requisito de despliegue (IIS)

El proceso de Node debe correr en una máquina/cuenta con **permiso de escritura** sobre el
recurso compartido `\\iis\www`. Al desplegarlo, ejecutá el backend con un usuario del dominio
que tenga acceso de escritura a esa carpeta del IIS (o instalalo directamente en el servidor IIS).
Solo así podrá agregar, reemplazar y eliminar los archivos que sirve el sitio.
