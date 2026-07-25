# Plan de implementación — Reordenar + Programar

Complementa `ESPECIFICACION-FEATURES.md` con las decisiones cerradas y los pasos concretos.

## Decisiones cerradas
- **Feature A (reordenar):** drag & drop. Solo banners (`tipo: "banners"`).
- **Feature B (programar):** **una sola vez** (no recurrente). Habilitado para **ambas** secciones
  (banners y libre). Una "ventana" = dos tareas ligadas (publicar en T1, eliminar en T2).
- **Cola de tareas:** `server/tareas.json` con **escritura atómica** (temp + rename). Sin DB.
- **Backend 24/7:** obligatorio como servicio de Windows (NSSM/pm2) para la Feature B.

---

## FEATURE A — Reordenar banners

### Backend
Nuevo endpoint (reusa `mapaBanners` / `RE_BANNER`):
```
PUT /api/banners/orden?carpeta=<ruta>     (requireAuth)
Body: { "orden": ["banner-3.png", "banner-1.jpg", "banner-2.png"] }
```
Algoritmo:
1. `actuales = Object.values(mapaBanners(destino))`.
2. Validar que `orden` sea una **permutación exacta** de `actuales`. Si no → `409`
   (`{ error: "La lista cambió, refrescá." }`).
3. **Rename en dos fases** (evita colisiones, preserva extensión):
   - Fase 1: cada archivo de `orden[i]` → `__ord_${i}__${ext}`.
   - Fase 2: cada `__ord_${i}__${ext}` → `banner-${i+1}${ext}`.
4. Responder `{ ok: true }`.

Helper sugerido: `reordenarBanners(destino, orden)`.

### Frontend (`Banners.jsx`)
- Estado local `ordenLocal` (copia editable de `banners`).
- Tarjetas `draggable`: `onDragStart` guarda índice; `onDragOver` (preventDefault) marca destino;
  `onDrop` reordena el array local.
- Chip que muestra la **posición futura** mientras se arrastra.
- Botón **"Guardar orden"** (visible solo si `ordenLocal` difiere de `banners`) → `api.reordenarBanners`.
- Botón **"Descartar"** para volver al orden guardado.
- Éxito/error con `Toast`; al terminar, `refrescar()`.

### Casos borde
- 0 o 1 banner → drag deshabilitado.
- `409` del backend → Toast de error + `refrescar()`.

### Aceptación
- Reordenar 3+ banners renombra sin huecos y el orden persiste tras recargar.
- Reordenamientos repetidos no pierden ni corrompen archivos.

---

## FEATURE B — Programar alta/baja (una sola vez)

### Arquitectura
1. **Staging** `server/pendientes/`: la publicación futura se guarda **ya** a disco
   (`<idTarea><ext>`). A la hora, se mueve al destino. La baja no usa staging.
2. **Cola** `server/tareas.json` (escritura atómica).
3. **Poller** `setInterval` cada 30 s: busca `pendiente` con `ejecutarEn <= ahora` y ejecuta.
4. **Recuperación al arrancar:** primer barrido ejecuta las vencidas mientras estuvo caído (en orden).
5. **Zona horaria:** guardar epoch UTC; UI en `America/Argentina/Buenos_Aires`.
6. **Identidad por hash (clave):** la baja guarda el **SHA-256 del contenido**; al ejecutar busca el
   archivo por hash (robusto a renumeración/reorden). Si no está → `hecha` (no-op) con nota.

### Modelo de tarea (`tareas.json`)
```jsonc
{
  "id": "uuid",
  "tipo": "banners" | "libre",
  "carpeta": "banners/pc",
  "accion": "publicar" | "eliminar",
  "ejecutarEn": 1737849600000,          // epoch ms UTC
  "estado": "pendiente" | "hecha" | "error" | "cancelada",
  // publicar:
  "archivoStaging": "pendientes/<id>.png",
  "nombreOriginal": "promo.png",
  // eliminar:
  "hashObjetivo": "sha256…",
  "referencia": "banner-3.png",         // solo informativo para la UI
  // ligazón ventana + auditoría:
  "ventanaId": "uuid|null",
  "creadoPor": "user", "creadoEn": 0, "ejecutadoEn": 0, "error": null
}
```

### Ejecución
- **publicar / banners:** `n = proximoNumero(mapaBanners(destino))` **en el momento**;
  mover staging → `banner-n.ext`.
- **publicar / libre:** mover staging → destino con nombre seguro (sufijo si colisiona, como hoy).
- **eliminar / banners:** buscar por `hashObjetivo`, borrar y `renumerar`.
- **eliminar / libre:** buscar por `hashObjetivo`, borrar.
- Éxito → `estado: "hecha"`, `ejecutadoEn`. Falla → `estado: "error"`, `error`.

### Endpoints (`requireAuth`)
```
POST   /api/programaciones     // multipart si publica; body: carpeta, tipo, accion(es), fechas
GET    /api/programaciones     // lista (filtrable por estado/carpeta)
DELETE /api/programaciones/:id // cancela una pendiente (borra su staging)
```
Crear una **ventana** (publicar + eliminar) genera 2 tareas con el mismo `ventanaId`; el `hashObjetivo`
de la baja se calcula del archivo subido.

### Frontend
- En la carga: opción **"Programar"** con `datetime-local` de **alta** y/o **baja** (al menos una).
- Nueva vista **"Programadas"**: lista con estado, fechas, acción, sección y botón **cancelar**;
  auto-refresco liviano.
- Validaciones: fecha futura; alta < baja en una ventana.

### Casos borde
- Servidor apagado a la hora → recuperación al arrancar.
- Staging faltante o carpeta destino cambiada → `error`.
- Baja cuyo archivo ya no existe → `hecha` (no-op) con nota.
- Solapamientos sobre el mismo archivo → permitir, se resuelven por hash al ejecutar.

### Prerequisito de despliegue
Backend como **servicio Windows** (NSSM/pm2) con reinicio automático. Documentar en `DESPLIEGUE.md`.

---

## Orden de trabajo
1. **Feature A** (backend endpoint + drag & drop). Rápida, sin DB, ya deja valor.
2. **Feature B** — fase 1: cola + poller + staging + endpoints + ejecución (banners y libre).
3. **Feature B** — fase 2: UI de programar + vista "Programadas" + recuperación al arrancar + tz.
4. Servicio Windows + doc de despliegue.

## Archivos afectados (estimado)
- Backend: `server/index.js` (endpoints A y B), `server/tareas.js` (nuevo: cola atómica + poller),
  `server/pendientes/` (staging, en `.gitignore`).
- Frontend: `client/src/Banners.jsx` (drag & drop), `client/src/Programar.jsx` (nuevo),
  `client/src/Programadas.jsx` (nuevo), `client/src/api.js`, `client/src/App.jsx` (nueva pestaña),
  `client/src/Usuario.jsx`.
