const imdbRegex = /https?:\/\/(www|m)\.imdb\.com(\/[a-z]{2})?\/title\/(tt\d+)\/?/i;
const adoroCinemaRegex = /https?:\/\/www\.adorocinema\.com\/(filmes|series)\/([^\/]+)/i;

// Initial variable to store TMDB API key
let TMDB_API_KEY = null;

// Load the TMDB API key from storage
chrome.storage.local.get("tmdbApiKey", (result) => {
  TMDB_API_KEY = result.tmdbApiKey || null;
});

// Function to get IMDb ID directly from IMDb search results
async function getImdbIdFromSearch(title, year = '') {
  try {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "searchImdb",
        title: title,
        year: year
      }, response => {
        resolve(response && response.imdbId ? response.imdbId : null);
      });
    });
  } catch (error) {
    console.error('Error searching IMDb:', error);
    return null;
  }
}

async function findImdbIdByTitle(title, year = '') {
  try {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "searchOMDb",
        title: title,
        year: year
      }, response => {
        resolve(response && response.imdbId ? response.imdbId : null);
      });
    });
  } catch (error) {
    console.error('Error fetching from OMDb:', error);
    return null;
  }
}

// Get TMDB ID for a title
async function getTMDBId(title, year, isSeries) {
  if (!TMDB_API_KEY || !title) return null;
  const type = isSeries ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? '&year=' + year : ''}&language=pt-BR`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data.results?.length) return null;
    // Prioritize exact title + year match
    const result = data.results.find(r =>
      (r.title?.toLowerCase() === title.toLowerCase() || r.name?.toLowerCase() === title.toLowerCase()) &&
      (!year || (r.release_date || r.first_air_date || '').startsWith(year))
    ) || data.results[0];
    return result ? result.id : null;
  } catch (e) {
    console.error('[Stremio] TMDB search error:', e);
    return null;
  }
}

// Get IMDb ID via TMDB external IDs
async function getIMDbIdViaTMDB(tmdbId, isSeries) {
  if (!TMDB_API_KEY || !tmdbId) return null;
  const type = isSeries ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  try {
    const response = await fetch(url);
    const details = await response.json();
    return details.external_ids?.imdb_id || null;
  } catch (e) {
    console.error('[Stremio] TMDB external IDs error:', e);
    return null;
  }
}

// NOVA FUNÇÃO: Verificar tipo de conteúdo via OMDb API
async function getContentTypeFromOMDb(imdbId) {
  try {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: "getContentType",
        imdbId: imdbId
      }, response => {
        resolve(response && response.type ? response.type : null);
      });
    });
  } catch (error) {
    console.error('Error getting content type:', error);
    return null;
  }
}

function addStremioButtons() {
  // IMDb links
  const imdbLinks = [
    ...document.querySelectorAll("a[href*='imdb.com/']")
  ].filter(a =>
    imdbRegex.test(a.href) && a.textContent.trim().length > 0
  );

  // IMDB
  imdbLinks.forEach(imdbLink => {
    if (imdbLink.querySelector(".stremio-button")) return;

    const match = imdbLink.href.match(imdbRegex);
    if (!match) return;

    const imdbId = match[3];
    const titleElement = imdbLink.querySelector("h3");
    if (!titleElement) return;

    // Extrai e limpa o título
    let title = titleElement.textContent.trim()
      .replace('Série de TV', 'TV Series')
      .trim();

    const stremioIcon = document.createElement("img");
    stremioIcon.src = chrome.runtime.getURL("icons/stremio.png");
    stremioIcon.alt = "Stremio";
    stremioIcon.classList.add("stremio-button");
    stremioIcon.style = "width: 25px; height: 25px; margin-left: 11px; cursor: pointer; vertical-align: sub;";

    stremioIcon.addEventListener("click", async (event) => {
      event.stopPropagation();
      event.preventDefault();

      // Feedback visual durante a busca
      stremioIcon.style.opacity = "0.5";

      // Verificar tipo de conteúdo via OMDb API
      const omdbType = await getContentTypeFromOMDb(imdbId);
      const contentType = omdbType === 'series' || omdbType === 'episode' ? 'series' : 'movie';

      // Restaura a opacidade
      stremioIcon.style.opacity = "1";

      chrome.storage.local.get("useStremioApp", (result) => {
        let useApp = result.useStremioApp !== undefined ? result.useStremioApp : null;
        if (useApp === null) {
          const choice = confirm("Do you want to use the Stremio app? (Click OK for app, Cancel for web)\nThis option can be changed from settings later.");
          useApp = choice;
          chrome.storage.local.set({ useStremioApp: useApp });
        }

        const targetUrl = contentType === 'series'
          ? (useApp ? `stremio://detail/series/${imdbId}` : `https://web.stremio.com/#/detail/series/${imdbId}`)
          : (useApp ? `stremio://detail/movie/${imdbId}/${imdbId}` : `https://web.stremio.com/#/detail/movie/${imdbId}/${imdbId}`);

        if (useApp) {
          const appLink = document.createElement("a");
          appLink.href = targetUrl;
          appLink.click();
        } else {
          window.open(targetUrl, '_blank');
        }
      });
    });

    titleElement.appendChild(stremioIcon);
  });

  // AdoroCinema links
  const processedContainers = new Set();
  const adoroCinemaLinks = [
    ...document.querySelectorAll("a[href*='adorocinema.com/filmes/'], a[href*='adorocinema.com/series/']")
  ].filter(a =>
    adoroCinemaRegex.test(a.href) && a.textContent.trim().length > 0
  );

  adoroCinemaLinks.forEach(adoroLink => {
    const container = adoroLink.closest('.g') || adoroLink.closest('.tF2Cxc') || adoroLink.closest('.yuRUbf');
    if (!container || processedContainers.has(container) || container.querySelector(".stremio-button")) {
      return;
    }

    processedContainers.add(container);

    const titleElement = container.querySelector('h3');
    if (!titleElement) return;

    let title = titleElement.textContent.trim()
      .replace(/\s+\-\s+AdoroCinema$/, '')
      .replace(/\s+\-\s+Filme \d{4}$/, '')
      .replace(/\s+\-\s+Série \d{4}$/, '')
      .replace(/\((\d{4})\)/, '')
      .trim();

    const yearMatch = titleElement.textContent.match(/\((\d{4})\)/) ||
      titleElement.textContent.match(/\bfilme\s+(\d{4})\b/i);
    const year = yearMatch ? yearMatch[1] : '';

    if (!title) return;

    const stremioIcon = document.createElement("img");
    stremioIcon.src = chrome.runtime.getURL("icons/stremio.png");
    stremioIcon.alt = "Stremio";
    stremioIcon.classList.add("stremio-button");
    stremioIcon.style = "width: 25px; height: 25px; margin-left: 11px; cursor: pointer; vertical-align: sub;";

    stremioIcon.addEventListener("click", async (event) => {
      event.stopPropagation();
      event.preventDefault();
      stremioIcon.style.opacity = "0.5";

      // Determine content type from URL
      const isSeries = adoroLink.href.includes('/series/');
      let contentType = isSeries ? 'series' : 'movie';
      let imdbId = null;
      
      // Step 1: Try to get TMDB ID from title
      const tmdbId = await getTMDBId(title, year, isSeries);
      console.log('[Stremio] TMDB ID:', tmdbId);
      
      // Step 2: If we have TMDB ID, get IMDb ID
      if (tmdbId) {
        imdbId = await getIMDbIdViaTMDB(tmdbId, isSeries);
        console.log('[Stremio] IMDb ID from TMDB:', imdbId);
      }
      
      // Step 3: If no IMDb ID from TMDB, try OMDb
      if (!imdbId) {
        imdbId = await findImdbIdByTitle(title, year);
        console.log('[Stremio] IMDb ID from OMDb:', imdbId);
      }
      
      // Step 4: If still no IMDb ID, try IMDb search
      if (!imdbId) {
        imdbId = await getImdbIdFromSearch(title, year);
        console.log('[Stremio] IMDb ID from IMDb search:', imdbId);
      }

      // If we have an IMDb ID, verify the content type
      if (imdbId) {
        const omdbType = await getContentTypeFromOMDb(imdbId);
        if (omdbType) {
          contentType = omdbType === 'series' || omdbType === 'episode' ? 'series' : 'movie';
        }
      }

      stremioIcon.style.opacity = "1";

      chrome.storage.local.get("useStremioApp", (result) => {
        let useApp = result.useStremioApp !== undefined ? result.useStremioApp : true;
        if (useApp === null) {
          const choice = confirm("Do you want to use the Stremio app? (Click OK for app, Cancel for web)\nThis option can be changed from settings later.");
          useApp = choice;
          chrome.storage.local.set({ useStremioApp: useApp });
        }

        let targetUrl;
        if (imdbId) {
          targetUrl = contentType === 'series'
            ? (useApp ? `stremio://detail/series/${imdbId}` : `https://web.stremio.com/#/detail/series/${imdbId}`)
            : (useApp ? `stremio://detail/movie/${imdbId}/${imdbId}` : `https://web.stremio.com/#/detail/movie/${imdbId}/${imdbId}`);
        } else {
          targetUrl = useApp
            ? `stremio://search?search=${encodeURIComponent(title)}`
            : `https://web.stremio.com/#/search?search=${encodeURIComponent(title)}`;
        }

        if (useApp) {
          const appLink = document.createElement("a");
          appLink.href = targetUrl;
          appLink.click();
        } else {
          window.open(targetUrl, '_blank');
        }
      });
    });

    titleElement.appendChild(stremioIcon);
  });
}

// Debounce helper to avoid excessive DOM updates
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

const debouncedAddStremioButtons = debounce(addStremioButtons, 250);

// Initial run
addStremioButtons();

// Observe DOM changes
const observer = new MutationObserver(() => {
  requestAnimationFrame(debouncedAddStremioButtons);
});

observer.observe(document.body, { childList: true, subtree: true });
