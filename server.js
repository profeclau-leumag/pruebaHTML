const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const TMDB_TOKEN = process.env.TMDB_TOKEN;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const PUBLIC_DIR = path.join(__dirname, 'public');

const moodProfiles = {
  divertido: { genres: [35, 16, 10751], sort: 'popularity.desc' },
  emocionante: { genres: [28, 12, 878], sort: 'popularity.desc' },
  reflexivo: { genres: [18, 878, 99], sort: 'vote_average.desc' },
  inspirador: { genres: [18, 12, 10751], sort: 'vote_average.desc' },
  intenso: { genres: [53, 80, 9648], sort: 'popularity.desc' },
  tranquilo: { genres: [10749, 16, 10751], sort: 'vote_average.desc' }
};

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

async function tmdb(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    const error = new Error(`TMDB respondió ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function imageUrl(filePath, size = 'w500') {
  return filePath ? `https://image.tmdb.org/t/p/${size}${filePath}` : null;
}

function normaliseMovie(movie) {
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title,
    overview: movie.overview || 'Sin sinopsis disponible en español.',
    release_date: movie.release_date || '',
    year: movie.release_date ? movie.release_date.slice(0, 4) : '—',
    poster_path: movie.poster_path,
    poster_url: imageUrl(movie.poster_path),
    backdrop_url: imageUrl(movie.backdrop_path, 'w1280'),
    vote_average: movie.vote_average || 0,
    vote_count: movie.vote_count || 0,
    popularity: movie.popularity || 0,
    genre_ids: movie.genre_ids || (movie.genres || []).map(g => g.id)
  };
}

function moodScore(movie, mood) {
  if (!mood || !moodProfiles[mood]) return 0;
  const preferred = moodProfiles[mood].genres;
  return (movie.genre_ids || []).reduce((score, id) => score + (preferred.includes(id) ? 5 : 0), 0);
}

function qualityScore(movie) {
  const votes = Math.log10((movie.vote_count || 0) + 1);
  const rating = movie.vote_average || 0;
  const popularity = Math.min((movie.popularity || 0) / 50, 3);
  return rating * 1.7 + votes * 1.4 + popularity;
}

function requireToken(res) {
  if (TMDB_TOKEN) return true;
  json(res, 503, {
    error: 'TMDB_TOKEN_NOT_CONFIGURED',
    message: 'Falta configurar TMDB_TOKEN en las variables de entorno.'
  });
  return false;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/status') {
    return json(res, 200, { configured: Boolean(TMDB_TOKEN) });
  }

  if (!requireToken(res)) return;

  if (url.pathname === '/api/genres') {
    const data = await tmdb('/genre/movie/list', { language: 'es-CL' });
    return json(res, 200, data.genres || []);
  }

  if (url.pathname === '/api/discover') {
    const genre = url.searchParams.get('genre');
    const mood = url.searchParams.get('mood');
    const duration = url.searchParams.get('duration');
    const era = url.searchParams.get('era');
    const rating = url.searchParams.get('rating') || '6';
    const page = url.searchParams.get('page') || '1';
    const profile = moodProfiles[mood];
    const currentYear = new Date().getFullYear();

    const params = {
      language: 'es-CL',
      region: 'CL',
      include_adult: false,
      include_video: false,
      page: Math.max(1, Math.min(Number(page) || 1, 20)),
      'vote_average.gte': Math.max(0, Math.min(Number(rating) || 0, 10)),
      'vote_count.gte': 80,
      sort_by: profile?.sort || 'popularity.desc'
    };

    // El género escogido por el usuario tiene prioridad. Si no escogió uno,
    // el estado de ánimo se convierte en un grupo OR de géneros relacionados.
    if (genre) params.with_genres = genre;
    else if (profile) params.with_genres = profile.genres.join('|');

    if (duration === 'short') params['with_runtime.lte'] = 119;
    if (duration === 'medium') {
      params['with_runtime.gte'] = 120;
      params['with_runtime.lte'] = 150;
    }
    if (duration === 'long') params['with_runtime.gte'] = 151;

    if (era === 'recent') params['primary_release_date.gte'] = `${currentYear - 3}-01-01`;
    if (era === '2020s') params['primary_release_date.gte'] = '2020-01-01';
    if (era === '2000-2019') {
      params['primary_release_date.gte'] = '2000-01-01';
      params['primary_release_date.lte'] = '2019-12-31';
    }
    if (era === 'classic') params['primary_release_date.lte'] = '1999-12-31';

    const data = await tmdb('/discover/movie', params);
    const movies = (data.results || [])
      .filter(movie => movie.poster_path && !movie.adult)
      .map(movie => ({ ...normaliseMovie(movie), _score: qualityScore(movie) + moodScore(movie, mood) }))
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...movie }) => movie);

    return json(res, 200, {
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
      results: movies
    });
  }

  const movieMatch = url.pathname.match(/^\/api\/movie\/(\d+)$/);
  if (movieMatch) {
    const id = Number(movieMatch[1]);
    const [details, providerData] = await Promise.all([
      tmdb(`/movie/${id}`, { language: 'es-CL' }),
      tmdb(`/movie/${id}/watch/providers`)
    ]);

    const chile = providerData.results?.CL || null;
    const providerGroups = ['flatrate', 'free', 'ads', 'rent', 'buy'];
    const seen = new Set();
    const providers = [];

    if (chile) {
      for (const group of providerGroups) {
        for (const provider of chile[group] || []) {
          if (seen.has(provider.provider_id)) continue;
          seen.add(provider.provider_id);
          providers.push({
            id: provider.provider_id,
            name: provider.provider_name,
            logo_url: imageUrl(provider.logo_path, 'w92'),
            type: group
          });
        }
      }
    }

    return json(res, 200, {
      ...normaliseMovie(details),
      runtime: details.runtime || null,
      genres: details.genres || [],
      tagline: details.tagline || '',
      providers,
      provider_link: chile?.link || null,
      provider_attribution: providers.length ? 'Datos de disponibilidad proporcionados por JustWatch.' : null
    });
  }

  if (url.pathname === '/api/recommendations') {
    const ids = String(url.searchParams.get('ids') || '')
      .split(',')
      .map(Number)
      .filter(Number.isInteger)
      .filter(id => id > 0)
      .slice(-3);

    if (!ids.length) return json(res, 200, { results: [] });

    const batches = await Promise.all(
      ids.map(id => tmdb(`/movie/${id}/recommendations`, { language: 'es-CL', page: 1 }))
    );

    const favoriteIds = new Set(ids);
    const merged = new Map();

    for (const batch of batches) {
      for (const movie of batch.results || []) {
        if (favoriteIds.has(movie.id) || !movie.poster_path || movie.adult) continue;
        const previous = merged.get(movie.id) || { movie, appearances: 0 };
        previous.appearances += 1;
        merged.set(movie.id, previous);
      }
    }

    const ranked = [...merged.values()]
      .map(({ movie, appearances }) => ({ movie, score: appearances * 15 + qualityScore(movie) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(({ movie }) => normaliseMovie(movie));

    return json(res, 200, { results: ranked });
  }

  return json(res, 404, { error: 'NOT_FOUND' });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const requested = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!requested.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(requested, (statErr, stat) => {
    let filePath = requested;
    if (statErr || !stat.isFile()) filePath = path.join(PUBLIC_DIR, 'index.html');

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    const status = error.status === 401 ? 401 : 500;
    return json(res, status, {
      error: 'API_ERROR',
      message: status === 401 ? 'El token de TMDB no es válido.' : 'No pudimos obtener datos de TMDB en este momento.'
    });
  }
});

server.listen(PORT, () => {
  console.log(`CineMatch listo en http://localhost:${PORT}`);
  if (!TMDB_TOKEN) console.log('⚠️  Falta configurar TMDB_TOKEN.');
});
