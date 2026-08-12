const $ = (selector) => document.querySelector(selector);

const state = {
  movies: [],
  personalMovies: [],
  featured: null,
  favorites: JSON.parse(localStorage.getItem('cinematch-favorites-v2') || '[]')
};

const els = {
  form: $('#filterForm'),
  genre: $('#genre'),
  mood: $('#mood'),
  duration: $('#duration'),
  era: $('#era'),
  rating: $('#rating'),
  grid: $('#movieGrid'),
  resultCount: $('#resultCount'),
  setupNotice: $('#setupNotice'),
  featuredSection: $('#featuredSection'),
  featuredBackdrop: $('#featuredBackdrop'),
  featuredPoster: $('#featuredPoster'),
  featuredTitle: $('#featuredTitle'),
  featuredMeta: $('#featuredMeta'),
  featuredOverview: $('#featuredOverview'),
  featuredGenres: $('#featuredGenres'),
  providerBlock: $('#providerBlock'),
  providerList: $('#providerList'),
  providerLink: $('#providerLink'),
  another: $('#anotherButton'),
  saveFeatured: $('#saveFeatured'),
  favoritesList: $('#favoritesList'),
  favoriteCount: $('#favoriteCount'),
  personalSection: $('#personalSection'),
  personalGrid: $('#personalGrid'),
  clearFavorites: $('#clearFavorites'),
  favoritesJump: $('#favoritesJump'),
  themeButton: $('#themeButton')
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  })[char]);
}

function runtimeText(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

function isFavorite(id) {
  return state.favorites.some(movie => movie.id === id);
}

function saveFavorites() {
  localStorage.setItem('cinematch-favorites-v2', JSON.stringify(state.favorites));
  renderFavorites();
  renderGrid(state.movies, els.grid);
  updateFeaturedFavoriteButton();
  loadPersonalRecommendations();
}

function toggleFavorite(movie) {
  if (!movie) return;
  if (isFavorite(movie.id)) {
    state.favorites = state.favorites.filter(item => item.id !== movie.id);
  } else {
    state.favorites.push({
      id: movie.id,
      title: movie.title,
      poster_url: movie.poster_url,
      poster_path: movie.poster_path,
      overview: movie.overview,
      release_date: movie.release_date,
      year: movie.year,
      vote_average: movie.vote_average,
      genre_ids: movie.genre_ids || []
    });
  }
  saveFavorites();
}

function updateFeaturedFavoriteButton() {
  if (!state.featured) return;
  els.saveFeatured.textContent = isFavorite(state.featured.id) ? '♥ Guardada' : '♡ Guardar';
}

function renderFavorites() {
  els.favoriteCount.textContent = state.favorites.length;
  if (!state.favorites.length) {
    els.favoritesList.innerHTML = '<p class="empty">Todavía no guardaste ninguna. Cuando una te guste, toca ♡.</p>';
    return;
  }
  els.favoritesList.innerHTML = state.favorites.map(movie => `
    <div class="favorite-chip">
      ${movie.poster_url ? `<img src="${movie.poster_url}" alt="">` : ''}
      <span>${escapeHtml(movie.title)}</span>
      <button type="button" data-remove-favorite="${movie.id}" aria-label="Quitar ${escapeHtml(movie.title)}">✕</button>
    </div>
  `).join('');
}

function cardTemplate(movie) {
  return `
    <article class="movie-card">
      <button class="poster-button" data-open-movie="${movie.id}" type="button" aria-label="Ver ${escapeHtml(movie.title)}">
        <img class="movie-poster" src="${movie.poster_url || ''}" alt="Póster de ${escapeHtml(movie.title)}" loading="lazy">
        <span class="score">★ ${Number(movie.vote_average || 0).toFixed(1)}</span>
      </button>
      <div class="card-body">
        <div class="card-head">
          <h3 class="card-title">${escapeHtml(movie.title)}</h3>
          <button class="card-fav" data-favorite-movie="${movie.id}" type="button" aria-label="Guardar ${escapeHtml(movie.title)}">${isFavorite(movie.id) ? '♥' : '♡'}</button>
        </div>
        <div class="card-year">${escapeHtml(movie.year || '—')}</div>
        <p class="card-overview">${escapeHtml(movie.overview || 'Sin sinopsis disponible.')}</p>
      </div>
    </article>
  `;
}

function renderGrid(movies, container) {
  if (!movies.length) {
    container.innerHTML = '<p class="empty">No encontré resultados con esa combinación. Prueba cambiando un filtro.</p>';
    return;
  }
  container.innerHTML = movies.map(cardTemplate).join('');
}

function renderSkeletons() {
  els.grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');
}

async function api(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo completar la solicitud.');
  return data;
}

async function loadGenres() {
  const genres = await api('/api/genres');
  els.genre.insertAdjacentHTML('beforeend', genres.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join(''));
}

function queryFromFilters() {
  const params = new URLSearchParams();
  if (els.genre.value) params.set('genre', els.genre.value);
  if (els.mood.value) params.set('mood', els.mood.value);
  if (els.duration.value) params.set('duration', els.duration.value);
  if (els.era.value) params.set('era', els.era.value);
  if (els.rating.value) params.set('rating', els.rating.value);
  params.set('page', String(Math.floor(Math.random() * 3) + 1));
  return params;
}

async function discover({ scroll = false } = {}) {
  renderSkeletons();
  els.resultCount.textContent = 'Buscando…';
  try {
    const data = await api(`/api/discover?${queryFromFilters()}`);
    state.movies = data.results || [];
    renderGrid(state.movies, els.grid);
    els.resultCount.textContent = `${state.movies.length} opciones de esta selección`;
    if (state.movies.length) {
      const first = state.movies[Math.floor(Math.random() * Math.min(state.movies.length, 6))];
      await showMovie(first.id, { scroll });
    }
  } catch (error) {
    els.grid.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
    els.resultCount.textContent = '';
  }
}

async function showMovie(id, { scroll = true } = {}) {
  try {
    const movie = await api(`/api/movie/${id}`);
    state.featured = movie;

    els.featuredBackdrop.style.backgroundImage = movie.backdrop_url
      ? `url("${movie.backdrop_url}")`
      : 'linear-gradient(135deg,#312e81,#831843)';
    els.featuredPoster.src = movie.poster_url || '';
    els.featuredPoster.alt = movie.poster_url ? `Póster de ${movie.title}` : '';
    els.featuredTitle.textContent = movie.title;
    els.featuredOverview.textContent = movie.overview || 'Sin sinopsis disponible.';

    const meta = [
      movie.year,
      runtimeText(movie.runtime),
      `★ ${Number(movie.vote_average || 0).toFixed(1)}`
    ].filter(Boolean);
    els.featuredMeta.innerHTML = meta.map(escapeHtml).join('<span>•</span>');
    els.featuredGenres.innerHTML = (movie.genres || []).map(g => `<span class="pill">${escapeHtml(g.name)}</span>`).join('');

    if (movie.providers?.length) {
      els.providerBlock.classList.remove('hidden');
      els.providerList.innerHTML = movie.providers.slice(0, 8).map(provider => `
        <span class="provider">
          ${provider.logo_url ? `<img src="${provider.logo_url}" alt="">` : ''}
          ${escapeHtml(provider.name)}
        </span>
      `).join('');
    } else {
      els.providerBlock.classList.add('hidden');
      els.providerList.innerHTML = '';
    }

    if (movie.provider_link) {
      els.providerLink.href = movie.provider_link;
      els.providerLink.classList.remove('hidden');
    } else {
      els.providerLink.classList.add('hidden');
    }

    updateFeaturedFavoriteButton();
    if (scroll) els.featuredSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    els.featuredTitle.textContent = 'No pude cargar esta película';
    els.featuredOverview.textContent = error.message;
  }
}

async function loadPersonalRecommendations() {
  if (!state.favorites.length) {
    els.personalSection.classList.add('hidden');
    return;
  }
  try {
    const ids = state.favorites.slice(-3).map(movie => movie.id).join(',');
    const data = await api(`/api/recommendations?ids=${ids}`);
    if (!data.results?.length) {
      state.personalMovies = [];
      els.personalSection.classList.add('hidden');
      return;
    }
    state.personalMovies = data.results;
    els.personalSection.classList.remove('hidden');
    renderGrid(state.personalMovies, els.personalGrid);
  } catch {
    state.personalMovies = [];
    els.personalSection.classList.add('hidden');
  }
}

function findMovieInPage(id) {
  return state.movies.find(movie => movie.id === id)
    || state.personalMovies.find(movie => movie.id === id)
    || state.favorites.find(movie => movie.id === id)
    || null;
}

els.form.addEventListener('submit', event => {
  event.preventDefault();
  discover({ scroll: true });
});

els.another.addEventListener('click', () => {
  if (!state.movies.length) return discover({ scroll: true });
  const candidates = state.movies.filter(movie => movie.id !== state.featured?.id);
  const choice = (candidates.length ? candidates : state.movies)[Math.floor(Math.random() * (candidates.length || state.movies.length))];
  showMovie(choice.id, { scroll: false });
});

els.saveFeatured.addEventListener('click', () => toggleFavorite(state.featured));
els.favoritesJump.addEventListener('click', () => $('#favoritesSection').scrollIntoView({ behavior: 'smooth' }));
els.clearFavorites.addEventListener('click', () => { state.favorites = []; saveFavorites(); });

els.favoritesList.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-favorite]');
  if (!button) return;
  const movie = state.favorites.find(item => item.id === Number(button.dataset.removeFavorite));
  toggleFavorite(movie);
});

document.addEventListener('click', event => {
  const open = event.target.closest('[data-open-movie]');
  if (open) return showMovie(Number(open.dataset.openMovie));

  const favorite = event.target.closest('[data-favorite-movie]');
  if (favorite) {
    const id = Number(favorite.dataset.favoriteMovie);
    const movie = findMovieInPage(id);
    if (movie) toggleFavorite(movie);
  }
});

els.themeButton.addEventListener('click', () => {
  document.body.classList.toggle('light');
  const light = document.body.classList.contains('light');
  els.themeButton.textContent = light ? '☾' : '☀';
  localStorage.setItem('cinematch-theme-v2', light ? 'light' : 'dark');
});

async function init() {
  if (localStorage.getItem('cinematch-theme-v2') === 'light') {
    document.body.classList.add('light');
    els.themeButton.textContent = '☾';
  }
  renderFavorites();

  try {
    const status = await api('/api/status');
    if (!status.configured) {
      els.setupNotice.classList.remove('hidden');
      return;
    }
    await Promise.all([loadGenres(), discover({ scroll: false })]);
    await loadPersonalRecommendations();
  } catch (error) {
    els.setupNotice.classList.remove('hidden');
    els.setupNotice.querySelector('p').textContent = error.message;
  }
}

init();
