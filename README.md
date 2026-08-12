# Resumenoteca

Biblioteca colaborativa de resúmenes con moderación previa.

## Funciones

### Visitantes
- Buscar por título, tema o contenido.
- Filtrar por asignatura y nivel.
- Leer resúmenes aprobados.
- Copiar o descargar como `.txt`.
- Compartir enlaces directos.
- Reportar publicaciones.
- Enviar un resumen sin cuenta.
- Importar `.txt` o `.md` al formulario.

### Administración
- Los envíos nuevos quedan `pending`.
- Panel en `/admin.html`.
- Aprobar o rechazar envíos.
- Revisar publicaciones reportadas.
- Eliminar publicaciones reportadas.

## Por qué usa Railway + PostgreSQL

Esta web es multiusuario: si una persona publica un resumen, debe quedar disponible para las demás.
Por eso necesita una base de datos compartida y no basta GitHub Pages.

Arquitectura:

```text
Navegador
   ↓
Node.js
   ↓
PostgreSQL
```

## Variables de entorno

En Railway configura:

```text
DATABASE_URL=...
ADMIN_KEY=una-clave-larga-y-privada
NODE_ENV=production
```

`ADMIN_KEY` nunca debe escribirse dentro de `public/` ni subirse a GitHub.

## Publicar en Railway

1. Sube esta carpeta a un repositorio de GitHub.
2. En Railway crea un proyecto desde ese repositorio.
3. Añade un servicio PostgreSQL al mismo proyecto.
4. En el servicio web agrega `DATABASE_URL` referenciando la variable del PostgreSQL.
5. Crea `ADMIN_KEY` con una clave privada y difícil de adivinar.
6. Agrega `NODE_ENV=production`.
7. Railway ejecutará `npm start`.
8. En **Settings → Networking**, genera un dominio público.

La primera vez que arranca, `server.js` crea automáticamente las tablas.

## Resúmenes de ejemplo

Con la base configurada puedes agregar tres ejemplos:

```bash
npm run seed
```

Solo se agregan si la tabla está vacía.

## Desarrollo local

Necesitas Node.js 20+ y PostgreSQL:

```bash
npm install
DATABASE_URL="postgresql://..." ADMIN_KEY="tu-clave" npm start
```

Luego abre:

```text
http://localhost:3000
```

Panel de administración:

```text
http://localhost:3000/admin.html
```

## Reglas y protecciones incorporadas

- Nada se publica automáticamente.
- Máximo 5 envíos por hora por origen como protección básica.
- Máximo 12.000 caracteres por resumen.
- Consultas SQL parametrizadas.
- El contenido del usuario se renderiza como texto, no como HTML.
- Clave administrativa en variable de entorno.
- Encabezados de seguridad.
- Sistema de reportes.
- Regla visible para evitar datos personales y copias extensas de material protegido.

## Próximas mejoras posibles

- Cuentas opcionales.
- Etiquetas.
- Favoritos.
- Calificaciones.
- PDF/DOCX mediante almacenamiento de archivos.
- Autores verificados.
- Paginación.
- Búsqueda de texto completo.
- Moderación distribuida si el sitio crece.
