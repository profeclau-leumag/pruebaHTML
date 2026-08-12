# CineMatch + TMDB

CineMatch es un recomendador de películas que consulta datos reales de **TMDB (The Movie Database)** mediante un backend Node.js.

## Qué incluye

- Filtros por género, ánimo, duración, época y puntuación mínima.
- Recomendación destacada con póster, sinopsis, duración y nota.
- Disponibilidad de streaming en Chile cuando TMDB/JustWatch tiene datos.
- Favoritas guardadas en el navegador con `localStorage`.
- Recomendaciones personalizadas a partir de las últimas películas favoritas.
- Backend que oculta el token de TMDB: el navegador nunca recibe `TMDB_TOKEN`.
- Diseño responsive para computador y teléfono.

## 1. Obtener el token de TMDB

1. Crea/inicia sesión en una cuenta de TMDB.
2. En la configuración de la cuenta, entra a la sección **API**.
3. Solicita acceso a la API si todavía no lo tienes.
4. Copia el valor **API Read Access Token**.

No pegues ese token en `public/app.js` ni lo subas a GitHub.

## 2. Probar localmente

Necesitas Node.js 20 o superior.

```bash
npm install
```

En macOS/Linux:

```bash
TMDB_TOKEN="TU_TOKEN" npm start
```

En PowerShell:

```powershell
$env:TMDB_TOKEN="TU_TOKEN"
npm start
```

Abre `http://localhost:3000`.

## 3. Subir a GitHub

Sube todo el proyecto excepto `.env` y `node_modules`. Ambos ya están considerados en `.gitignore`.

## 4. Publicar en Railway

1. Crea un proyecto en Railway desde el repositorio de GitHub.
2. Railway detectará `package.json` y ejecutará `npm start`.
3. En **Variables**, agrega:
   - Nombre: `TMDB_TOKEN`
   - Valor: tu **API Read Access Token** de TMDB.
4. Haz un nuevo deploy si Railway no lo hace automáticamente.
5. En **Networking**, genera el dominio público.

No necesitas configurar `PORT`: Railway la entrega automáticamente al proceso.

## Cómo funciona la recomendación

TMDB no tiene un filtro llamado “ánimo”. CineMatch lo interpreta como una heurística:

- Divertido → comedia, animación, familiar.
- Emocionante → acción, aventura, ciencia ficción.
- Reflexivo → drama, ciencia ficción, documental.
- Inspirador → drama, aventura, familiar.
- Intenso → thriller, crimen, misterio.
- Tranquilo → romance, animación, familiar.

Si además eliges un género concreto, el género elegido tiene prioridad y el ánimo se usa para reordenar los resultados. Eso evita combinaciones demasiado restrictivas que devuelvan cero películas.

## Estructura

```text
CineMatch_TMDB/
├─ package.json
├─ server.js
├─ .env.example
├─ .gitignore
├─ README.md
└─ public/
   ├─ index.html
   ├─ style.css
   └─ app.js
```

## Seguridad básica

`TMDB_TOKEN` solo se lee en `server.js`. El frontend llama rutas propias como `/api/discover`, y el servidor es quien se comunica con TMDB. Esto permite que el repositorio pueda ser público sin publicar la credencial.

## Atribuciones

TMDB exige atribución para el uso de su API y datos. La interfaz incluye el aviso requerido. Para una publicación definitiva, reemplaza la marca textual usada en el prototipo por uno de los **logos oficiales aprobados por TMDB** desde su sección oficial de logos y atribución, sin modificarlo.

Los datos de disponibilidad de streaming provienen de JustWatch a través del endpoint de proveedores de TMDB; la interfaz incluye la atribución a JustWatch.
