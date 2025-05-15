// rottentomatoes.js - Enhanced version with improved title extraction

// Chave padrão da TMDB
let TMDB_API_KEY = "815573e1bc6e1f4a5395783d8203c351";

// Se o usuário configurar uma chave, ela terá prioridade
chrome.storage.local.get("tmdbApiKey", (result) => {
  if (result.tmdbApiKey) TMDB_API_KEY = result.tmdbApiKey;
});

const OMDB_API_KEY = "64541305";

// Improved metadata extraction with better title cleaning
function extractTitleInfo() {
  const isSeries = window.location.href.includes('/tv/');
  
  // Try to get title from page - prioritize h1 elements with specific classes/attributes
  let title = document.querySelector('h1.scoreboard__title')?.textContent?.trim() ||
    document.querySelector('h1[data-qa="score-panel-title"]')?.textContent?.trim();
  
  // If we couldn't find the title in those elements, try series info section
  if (!title) {
    title = document.querySelector('.series-info h1')?.textContent?.trim();
  }
  
  // Last resort: use document title but clean it properly
  if (!title) {
    title = document.title
      .replace(/\s*[\-|]\s*Rotten\s*Tomatoes$/i, '')
      .trim();
  }
  
  // Extract year with multiple fallbacks
  const yearElement = document.querySelector('[data-qa="score-panel-release-year"], [data-qa="score-panel-subtitle"]') ||
    document.querySelector('.scoreboard__info');
  const year = yearElement?.textContent?.match(/\b(19\d{2}|20\d{2})\b/)?.[1] ||
    document.title.match(/\((\d{4})\)/)?.[1] || '';
  
  // Enhanced title cleaning
  if (title) {
    title = title
      .replace(/\s*[\-|]\s*Rotten\s*Tomatoes$/i, '') // Remove "- Rotten Tomatoes" or "| Rotten Tomatoes"
      .replace(/\(\d{4}\)/, '') // Remove year in parentheses
      .replace(/\bTV Series\b|\bMovie\b/gi, '') // Remove medium indicators
      .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
      .trim();
      
    // Debug log the cleaned title
    console.log('[Stremio] Extracted title:', title);
  }
  
  return {
    title,
    year,
    contentType: isSeries ? 'series' : 'movie'
  };
}

// Busca TMDB ID com priorização de correspondência exata
async function getTMDBId(title, year, isSeries) {
  if (!TMDB_API_KEY || !title) return null;
  
  const type = isSeries ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}&language=en-US`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.results?.length) {
      console.log('[Stremio] TMDB: No results found');
      return null;
    }
    
    // Prioriza correspondência exata de título e ano
    const exactMatch = data.results.find(r =>
      (r.title?.toLowerCase() === title.toLowerCase() || r.name?.toLowerCase() === title.toLowerCase()) &&
      (r.release_date || r.first_air_date || '').startsWith(year)
    );
    
    return exactMatch?.id || data.results[0]?.id;
  } catch (e) {
    console.error('[Stremio] TMDB search error:', e);
    return null;
  }
}

// Busca IMDb ID via TMDB com validação de tipo
async function getIMDbIdViaTMDB(tmdbId, isSeries) {
  if (!TMDB_API_KEY || !tmdbId) return null;
  
  const type = isSeries ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.external_ids?.imdb_id || null;
  } catch (e) {
    console.error('[Stremio] TMDB external IDs error:', e);
    return null;
  }
}

// Busca OMDb com fallback hierárquico
async function getIMDbIdViaOMDb(title, year, isSeries) {
  if (!title) return null;
  
  const typeParam = isSeries ? '&type=series' : '&type=movie';
  const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}${year ? `&y=${year}` : ''}${typeParam}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.Response === 'True' ? data.imdbID : null;
  } catch (e) {
    console.error('[Stremio] OMDb error:', e);
    return null;
  }
}

// Validação reforçada do tipo de conteúdo
async function validateIMDbType(imdbID, expectedType) {
  if (!imdbID) return false;
  
  try {
    const url = `https://www.omdbapi.com/?i=${imdbID}&apikey=${OMDB_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.Type === expectedType;
  } catch (e) {
    console.error('[Stremio] IMDb validation error:', e);
    return false;
  }
}

// Fluxo principal de busca com logging detalhado
async function findIMDbId() {
  const { title, year, contentType } = extractTitleInfo();
  const isSeries = contentType === 'series';
  
  console.log('[Stremio] Starting search for:', title, year, contentType);
  
  // Etapa 1: Busca direta de IMDb na página
  const imdbLink = [...document.querySelectorAll('a[href*="imdb.com/title/tt"]')]
    .find(link => link.href.match(/imdb\.com\/title\/(tt\d+)/i));
    
  if (imdbLink) {
    const imdbId = imdbLink.href.match(/imdb\.com\/title\/(tt\d+)/i)[1];
    console.log('[Stremio] Found IMDb ID in page:', imdbId);
    
    if (await validateIMDbType(imdbId, isSeries ? 'series' : 'movie')) {
      return { imdbId, contentType, title };
    }
  }
  
  // Etapa 2: Busca via TMDB
  if (title) {
    const tmdbId = await getTMDBId(title, year, isSeries);
    
    if (tmdbId) {
      const imdbId = await getIMDbIdViaTMDB(tmdbId, isSeries);
      
      if (imdbId) {
        console.log('[Stremio] Found via TMDB:', imdbId);
        return { imdbId, contentType, title };
      }
    }
  }
  
  // Etapa 3: Busca via OMDb
  if (title) {
    const imdbId = await getIMDbIdViaOMDb(title, year, isSeries);
    
    if (imdbId) {
      console.log('[Stremio] Found via OMDb:', imdbId);
      return { imdbId, contentType, title };
    }
  }
  
  // Etapa 4: Fallback para busca manual
  console.log('[Stremio] Falling back to manual search');
  return { imdbId: null, contentType, title };
}

// Geração de URLs unificada
function buildStremioUrl(imdbId, contentType, title, useApp) {
  if (imdbId) {
    const path = contentType === 'series'
      ? `detail/series/${imdbId}`
      : `detail/movie/${imdbId}`;
      
    return useApp
      ? `stremio://${path}`
      : `https://web.stremio.com/#/${path}`;
  }
  
  return useApp
    ? `stremio://search?search=${encodeURIComponent(title)}`
    : `https://web.stremio.com/#/search?search=${encodeURIComponent(title)}`;
}

// Implementação do botão com estilo consistente
function addStremioButton() {
  if (document.querySelector('.stremio-button-rt')) return;
  
  const button = document.createElement('img');
  button.src = chrome.runtime.getURL('icons/stremio.png');
  button.className = 'stremio-button-rt';
  button.style = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    cursor: pointer;
    z-index: 9999;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    transition: transform 0.2s;
  `;
  
  button.addEventListener('click', async () => {
    button.style.transform = 'scale(0.95)';
    
    const { imdbId, contentType, title } = await findIMDbId();
    
    chrome.storage.local.get("useStremioApp", ({ useStremioApp }) => {
      const url = buildStremioUrl(imdbId, contentType, title, useStremioApp !== false);
      window.open(url, useStremioApp ? '_self' : '_blank');
    });
    
    setTimeout(() => button.style.transform = '', 200);
  });
  
  document.body.appendChild(button);
}

// Inicialização com observação de mudanças
const observer = new MutationObserver(() => {
  if (!document.querySelector('.stremio-button-rt')) {
    addStremioButton();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Inicialização imediata se o DOM estiver pronto
if (document.readyState === 'complete') {
  addStremioButton();
} else {
  document.addEventListener('DOMContentLoaded', addStremioButton);
}
