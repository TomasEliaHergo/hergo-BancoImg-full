# Especificación de nuevas funcionalidades — Banco de Imágenes

Documento para el equipo de desarrollo. Describe **dos features nuevas** solicitadas por
marketing sobre la app existente:

- **Feature A — Reordenar imágenes** (cambiar el orden/posición sin borrar y recargar).
- **Feature B — Programar subida y baja de imágenes** (publicar/eliminar en fecha y hora).

---

## 0. Contexto del sistema actual (para ubicarse)

- **Qué es:** app interna para que marketing suba/reemplace/elimine las imágenes que
  consumen las aplicaciones de la empresa. Las apps leen los archivos **directamente** desde
  un recurso de red (`\\iis\www\...`) **por nombre**. Esta app es el "puente" que administra
  esos archivos.
- **Stack:** frontend React + Vite (`client/`), backend Node/Express (`server/`).
- **Sin base de datos:** los datos viven en archivos — `server/usuarios.json` (usuarios/roles),
  `server/config.json` (apps → páginas → secciones → carpeta destino), y las imágenes en el
  recurso de red. Auth propia por token (login local).
- **Dónde escribir/leer archivos:** todo pasa por el backend (único con acceso de escritura a
  la red). El frontend NUNCA toca archivos; llama a la API.
- **Dos tipos de sección** (ver `config.json`, campo `tipo`):
  - `banners`: archivos **numerados** `banner-1.ext`, `banner-2.ext`, … El **número ES el orden**
    con que las apps los muestran. Al borrar, hoy se **renumera** para no dejar huecos
    (ver funciones `mapaBanners`, `borrarBanner`, `renumerar`, `guardarBanner` en `server/index.js`).
  - `libre` (ej. popup): nombres arbitrarios; hoy se listan por fecha de modificación.

> Regla de oro: cualquier operación nueva sobre archivos se implementa en el **backend**
> (`server/index.js`), respetando la validación de rutas existente (`resolverCarpeta`, que
> impide salir del directorio base).

---

## FEATURE A — Reordenar imágenes

### Caso de uso
"Cargué los banners en un orden equivocado. Quiero mover uno de posición (o reordenar todos)
sin borrar ni volver a subir."

### Alcance y comportamiento esperado

**A.1 — Banners (secciones `tipo: "banners"`)** — *prioridad alta, es el caso real.*
- El orden = el número del archivo (`banner-1`, `banner-2`, …).
- El usuario debe poder:
  - **Mover una imagen a otra posición** (ej. pasar el banner 3 a la posición 1), y el resto
    se recorre en consecuencia (drag & drop o botones ↑/↓).
  - Alternativamente, **reordenar toda la lista** de una y guardar el nuevo orden.
- Al confirmar, el backend **renombra los archivos** para que reflejen el nuevo orden
  (`banner-N.ext`), manteniendo la secuencia sin huecos.

**A.2 — Imágenes libres (secciones `tipo: "libre"`)** — *evaluar si aplica.*
- Estos archivos NO codifican orden en el nombre. Si las apps que los consumen no dependen de
  un orden, esta feature **no aplica** a `libre`. Si en algún caso sí importa, habría que
  **persistir un orden explícito** (metadato aparte), lo cual excede lo pedido hoy.
- **Recomendación:** implementar reordenamiento SOLO para `banners` en esta iteración.
  Confirmar con marketing si necesitan ordenar también las `libre`.

### Consideraciones técnicas (importantes)
- **Colisiones al renombrar:** no se puede renombrar directo (ej. `banner-2`→`banner-1`) si el
  destino existe. Resolver en dos fases: renombrar todo a nombres temporales únicos y luego a
  los definitivos, o calcular el mapeo completo y aplicar con temporales intermedios.
- **Extensiones mixtas:** cada banner puede tener distinta extensión (`.png`, `.jpg`, …).
  El renombrado debe preservar la extensión de cada archivo.
- **Lectura concurrente:** las apps leen `\\iis\www` en vivo. Durante el reordenamiento hay un
  instante con archivos a medio renombrar. Hacer la operación lo más atómica/rápida posible
  (idealmente preparar todo y aplicar los `rename` seguidos). Documentar esta limitación.
- **Reusar la lógica existente** de numeración (`mapaBanners` / patrón `RE_BANNER`) en vez de
  reinventarla.

### API propuesta (a ajustar por el equipo)
Un endpoint que recibe el orden deseado y renombra en consecuencia. Ejemplo:

```
PUT /api/banners/orden?carpeta=<ruta>
Body: { "orden": ["banner-3.png", "banner-1.jpg", "banner-2.png"] }
```
- `orden` = lista de archivos actuales en el nuevo orden deseado.
- El backend valida que la lista corresponda exactamente a los banners existentes y renombra
  a `banner-1`, `banner-2`, … según ese orden (con nombres temporales para evitar colisión).
- Requiere rol miembro (igual que el resto de operaciones de banners).

### UI propuesta
- En la vista de banners, permitir **arrastrar para reordenar** (o botones subir/bajar por item).
- Botón "Guardar orden" que dispara el `PUT`. Feedback de éxito/error (usar el `Toast` existente).

### Casos borde
- Lista vacía o un solo banner → no-op.
- El `orden` recibido no coincide con los archivos reales (alguien borró/agregó en el medio) →
  rechazar con error claro y refrescar la lista.
- Archivos que no matchean el patrón `banner-N` → ignorar / no tocar.

### Criterio de aceptación
- Reordenar 3+ banners deja los archivos renombrados correctamente y sin huecos.
- Las apps que consumen `\\iis\www` ven el nuevo orden.
- No se pierde ni corrompe ningún archivo ante reordenamientos repetidos.

---

## FEATURE B — Programar subida y baja de imágenes

### Caso de uso
"Quiero que esta imagen se **publique** el lunes 8:00 y se **elimine** el viernes 18:00, sin
tener que entrar en ese momento." (Ventanas de campaña/promoción.)

### Concepto central
Programar = alguien debe ejecutar la acción a la hora indicada. Ese "alguien" es el **backend
interno** (único con acceso a `\\iis\www`). El frontend solo **registra** la programación; el
backend la **ejecuta** mediante un pequeño motor de tareas.

**Implicancia:** el backend debe correr como **servicio SIEMPRE activo** (Windows Service vía
NSSM o pm2), con reinicio automático. Si está apagado a la hora programada, la tarea no ocurre.

### Comportamiento esperado
- El usuario puede programar, para una imagen:
  - **Fecha/hora de publicación** (cuándo aparece en `\\iis\www`), y/o
  - **Fecha/hora de baja** (cuándo se elimina de `\\iis\www`).
- Puede definir **ambas** (ventana) o solo una.
- Debe poder **ver la lista** de programaciones y **cancelar/editar** las pendientes.

### Piezas nuevas necesarias
1. **Staging (pendientes):** si la publicación es futura, el archivo se sube **ya** pero se
   guarda en una carpeta intermedia del backend (ej. `server/pendientes/`), NO en `\\iis\www`.
   Recién en la hora programada el backend lo mueve al destino. Las bajas programadas no
   requieren staging (la imagen ya está publicada).
2. **Registro de tareas** (ver modelo de datos).
3. **Motor de tareas ("reloj"):** chequeo periódico (ej. cada 30–60 s) que busca tareas
   vencidas y las ejecuta. Usar `node-cron` o un `setInterval` simple.
4. **Recuperación tras apagón:** al iniciar el backend, ejecutar/marcar las tareas cuya hora ya
   pasó mientras estuvo caído (para no publicar de más ni dejar algo publicado de más).
5. **Zona horaria:** operar en hora Argentina (America/Argentina/Buenos_Aires). Verificar el
   reloj del servidor. Guardar timestamps normalizados.

### Modelo de datos (una tarea programada)
```
{
  id,
  tipo,            // "banner" | "libre"
  carpeta,         // ruta destino relativa a baseDir
  accion,          // "publicar" | "eliminar"  (una ventana = 2 tareas ligadas)
  archivoPendiente,// ruta en staging (solo para publicar)
  objetivo,        // nombre de archivo o número de banner (para eliminar / identificar)
  ejecutarEn,      // fecha/hora de ejecución
  estado,          // "pendiente" | "hecha" | "error" | "cancelada"
  creadoPor, creadoEn, ejecutadoEn, error
}
```

### API propuesta (orientativa)
```
POST   /api/programaciones        // crea una programación (con upload si es publicación futura)
GET    /api/programaciones        // lista (filtrable por estado/carpeta)
DELETE /api/programaciones/:id    // cancela una pendiente
```

### UI propuesta
- En la carga de imagen, opción "Programar" con selector de fecha/hora de publicación y de baja.
- Vista "Programadas" con estado, fecha, acción y botón cancelar.

### Interacción con banners numerados (cuidado)
- Una **baja programada** de un banner dispara la **renumeración** (misma lógica que el borrado
  actual). Ejecutar esa renumeración en el momento de la baja.
- Una **alta programada** de un banner debe tomar el **próximo número disponible en el momento
  de ejecutarse**, NO al momento de programar (para no chocar con cambios intermedios).

### Casos borde
- Servidor apagado en la hora → recuperación al arrancar.
- Imagen en staging eliminada o carpeta destino cambiada antes de ejecutar → marcar `error`.
- Dos tareas para el mismo archivo/posición → definir prioridad o rechazar solapamiento.
- Baja de un archivo que ya no existe → marcar hecha/no-op con aviso.

### Preguntas abiertas a definir con marketing (condicionan el diseño)
1. ¿Programaciones **de una sola vez** o **recurrentes** (ej. "todos los lunes")? La recurrencia
   es bastante más compleja; sugerido arrancar con **una sola vez**.
2. ¿Siempre programan **ventana** (alta + baja) o a veces solo una de las dos?
3. ¿Precisión necesaria: hora/minuto, o alcanza con el día?
4. ¿También quieren **programar reemplazos** de un banner existente, o solo alta y baja?

---

## Notas de arquitectura transversales

- **Base de datos:** hoy los datos son archivos JSON. La **Feature B** introduce una "cola de
  tareas" con estados y concurrencia; manejarla en JSON es frágil (escrituras que se pisan,
  ejecuciones a medias). **Recomendación:** migrar usuarios/config/tareas a **SQLite**
  (`better-sqlite3`, sin servidor aparte, ideal en Windows). Las imágenes siguen en `\\iis\www`.
  La Feature A no lo requiere; la Feature B sí lo justifica.
- **Backend como servicio siempre activo** (NSSM/pm2): pasa de recomendable a **obligatorio**
  con la Feature B.
- **No romper la arquitectura actual:** un solo server interno que sirve frontend + API. Estas
  features solo agregan endpoints y pantallas; el modelo de despliegue no cambia
  (ver `DESPLIEGUE.md`).
- **Seguridad/permisos:** respetar los roles actuales (miembro/administrador). Definir si
  programar/reordenar requiere permisos especiales.

## Prioridad sugerida
1. **Feature A (reordenar banners)** — más simple, alto valor inmediato, no requiere DB.
2. **Feature B (programación)** — mayor esfuerzo; hacerla junto con la migración a SQLite y el
   backend como servicio.
