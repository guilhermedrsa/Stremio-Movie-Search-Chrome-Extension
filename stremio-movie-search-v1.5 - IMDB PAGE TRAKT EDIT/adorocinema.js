// adorocinema.js - Enhanced version with TMDB prioritized over OMDb and no translation

// Chave padrão da TMDB
let TMDB_API_KEY = "815573e1bc6e1f4a5395783d8203c351";

// Se o usuário configurar uma chave, ela terá prioridade
chrome.storage.local.get("tmdbApiKey", (result) => {
  if (result.tmdbApiKey) TMDB_API_KEY = result.tmdbApiKey;
});

const OMDB_API_KEY = "64541305";

// Enhanced metadata extraction with better title cleaning
function extractTitleInfo() {
    const isSeries = window.location.href.includes('/series/');
    let title = isSeries
        ? document.querySelector('div[data-test="series-title-original"]')?.textContent?.trim()
        : document.querySelector('div[data-test="title-original"]')?.textContent?.trim();

    // Fallbacks for other selectors
    if (!title) {
        const titleElement = document.querySelector('h1.titlebar-title, h1[itemprop="name"], div.titlebar-title[itemprop="name"]');
        title = titleElement?.textContent.trim() || document.title.replace(' - AdoroCinema', '').trim();

        // Look for alternative original title
        const metaBodyInfo = document.querySelectorAll('.meta-body-info');
        for (const infoElement of metaBodyInfo) {
            if (infoElement.textContent.includes("Título original")) {
                const match = infoElement.textContent.match(/Título original\s*:\s*([^(]+)/);
                if (match && match[1]) {
                    title = match[1].trim();
                    break;
                }
            }
        }
    }

    // Release year
    const year = document.querySelector(isSeries ? '[data-test="series-release-year"]' : '[data-test="film-release-year"]')?.textContent
        || document.querySelector('.meta-body-info')?.textContent.match(/\b(19\d{2}|20\d{2})\b/)?.[1]
        || document.title.match(/\((\d{4})\)/)?.[1]
        || '';

    // Enhanced title cleaning with comprehensive regex
    if (title) {
        title = title
            .replace(/\s+\-\s+AdoroCinema$/, '')
            .replace(/\s+\-\s+Filme \d{4}$/, '')
            .replace(/\s+\-\s+Série \d{4}$/, '')
            .replace(/\((\d{4})\)/, '')
            .replace(/\bFilme\b|\bSérie\b/gi, '')
            .replace(/\bLonga\s*\-?metragem\b/gi, '')
            .replace(/\(\s*\)/g, '') // Remove empty parentheses
            .replace(/\[\s*\]/g, '') // Remove empty brackets
            .replace(/\s{2,}/g, ' ') // Replace multiple spaces with single space
            .trim();
    }

    const contentType = isSeries ? 'series' : 'movie';
    return { title, year, contentType };
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

// Get IMDb ID via OMDb API
async function getIMDbIdViaOMDb(title, year, isSeries) {
    if (!title) return null;
    try {
        const type = isSeries ? '&type=series' : '&type=movie';
        const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(title)}${year ? `&y=${year}` : ''}${type}`;
        const response = await fetch(url);
        const data = await response.json();
        return (data.Response === 'True' && data.imdbID) ? data.imdbID : null;
    } catch (e) {
        console.error('[Stremio] OMDb error:', e);
        return null;
    }
}

// Validate IMDb type
async function validateIMDbType(imdbID, expectedType) {
    if (!imdbID) return false;
    try {
        const url = `https://www.omdbapi.com/?i=${imdbID}&apikey=${OMDB_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.Type === expectedType;
    } catch (e) {
        return false;
    }
}

// Manual IMDb input fallback
async function manualIMDbInput(title) {
    const userInput = prompt(
        `Não foi possível encontrar o ID do IMDb para "${title}".\nSe você souber o ID, digite-o aqui (ex: tt1234567):`
    );
    if (userInput && /^tt\d+$/.test(userInput.trim())) {
        return userInput.trim();
    }
    return null;
}

// Main search function with improved flow
async function findIMDbId() {
    const { title, year, contentType } = extractTitleInfo();
    const isSeries = contentType === 'series';
    let imdbId = null;
    let tmdbId = null;
    console.log('[Stremio] Original title:', title, 'Year:', year);

    // Step 1: Look for IMDb ID directly on the page
    const imdbLinks = [...document.querySelectorAll('a[href*="imdb.com/title/"]')];
    if (imdbLinks.length > 0) {
        const match = imdbLinks[0].href.match(/imdb\.com(?:\/[a-z]{2})?\/title\/(tt\d+)/i);
        if (match) {
            imdbId = match[1];
            console.log('[Stremio] IMDb ID found in page:', imdbId);

            // If we have IMDb ID and it's valid, return early
            if (imdbId) {
                const isValid = await validateIMDbType(imdbId, isSeries ? 'series' : 'movie');
                if (isValid) {
                    return { imdbId, contentType, title };
                }
            }
        }
    }

    // Step 2: Get TMDB ID from title
    if (title) {
        tmdbId = await getTMDBId(title, year, isSeries);
        console.log('[Stremio] TMDB ID:', tmdbId);

        // Step 3: If we have TMDB ID, get IMDb ID
        if (tmdbId) {
            // Get IMDb ID from TMDB
            imdbId = await getIMDbIdViaTMDB(tmdbId, isSeries);
            if (imdbId) {
                console.log('[Stremio] IMDb ID from TMDB:', imdbId);
                return { imdbId, contentType, title };
            }
        }
    }

    // Step 4: Try OMDb with original title
    if (title && !imdbId) {
        imdbId = await getIMDbIdViaOMDb(title, year, isSeries);
        if (imdbId) {
            console.log('[Stremio] IMDb ID from OMDb with original title:', imdbId);
            return { imdbId, contentType, title };
        }
    }

    // Step 5: Try IMDb search via background script (with original title)
    if (title && !imdbId) {
        imdbId = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: "searchImdb",
                title: title,
                year: year
            }, response => {
                resolve(response?.imdbId || null);
            });
        });
        if (imdbId) {
            console.log('[Stremio] IMDb ID from IMDb search with original title:', imdbId);
            return { imdbId, contentType, title };
        }
    }

    // Step 6: Manual input as last resort
    if (!imdbId) {
        imdbId = await manualIMDbInput(title);
        if (imdbId) {
            console.log('[Stremio] Manual IMDb ID input:', imdbId);
            return { imdbId, contentType, title };
        }
    }

    return { imdbId: null, contentType, title };
}

// Stremio button and handling
async function addStremioButton() {
    if (document.querySelector('.stremio-button')) return;

    const stremioIcon = document.createElement('img');
    stremioIcon.src = chrome.runtime.getURL("icons/stremio.png");
    stremioIcon.alt = "Stremio";
    stremioIcon.className = "stremio-button";
    stremioIcon.style = `
        width: 34px;
        height: 34px;
        margin-left: 7px;
        cursor: pointer;
        vertical-align: -5px;
        border-radius: 6px;
        padding: 4px;
        box-sizing: content-box;
        display: inline-block;
    `;

    stremioIcon.addEventListener('click', async (e) => {
        e.preventDefault();
        stremioIcon.style.opacity = '0.5';
        const { imdbId, contentType, title } = await findIMDbId();
        stremioIcon.style.opacity = '1';

        chrome.storage.local.get("useStremioApp", (result) => {
            const useApp = result.useStremioApp !== undefined ? result.useStremioApp : true;
            let stremioUrl;

            if (imdbId) {
                stremioUrl = contentType === 'series'
                    ? (useApp ? `stremio://detail/series/${imdbId}` : `https://web.stremio.com/#/detail/series/${imdbId}`)
                    : (useApp ? `stremio://detail/movie/${imdbId}/${imdbId}` : `https://web.stremio.com/#/detail/movie/${imdbId}/${imdbId}`);
            } else {
                // Use title for search when no IMDb ID is found
                if (title) {
                    stremioUrl = useApp
                        ? `stremio://search?search=${encodeURIComponent(title)}`
                        : `https://web.stremio.com/#/search?search=${encodeURIComponent(title)}`;
                } else {
                    alert("Não foi possível encontrar informações suficientes para abrir no Stremio.");
                    return;
                }
            }

            if (useApp && stremioUrl.startsWith('stremio://')) {
                const appLink = document.createElement("a");
                appLink.href = stremioUrl;
                appLink.click();
            } else {
                window.open(stremioUrl, '_blank');
            }
        });
    });

    // Insert button in appropriate location
    const containers = [
        document.querySelector('.titlebar-title')?.parentNode,
        document.querySelector('h1.titlebar-title')?.parentNode,
        document.querySelector('div.titlebar-title')?.parentNode,
        document.querySelector('.header-main-logo-holder')?.parentNode,
        document.querySelector('.buttons-holder'),
        document.querySelector('.meta-title-holder'),
        document.querySelector('.meta-body-item'),
        document.querySelector('h1.title')?.parentNode,
        document.querySelector('.titlebar'),
        document.querySelector('h1')
    ];

    const container = containers.find(el => el);
    if (container && !container.querySelector('.stremio-button')) {
        if (container.querySelector('.titlebar-title')) {
            const titlebar = container.querySelector('.titlebar-title');
            titlebar.parentNode.insertBefore(stremioIcon, titlebar.nextSibling);
        } else if (container.tagName && container.tagName.toLowerCase() === 'h1') {
            container.parentNode.insertBefore(stremioIcon, container.nextSibling);
        } else {
            container.appendChild(stremioIcon);
        }
    } else {
        setTimeout(() => addStremioButton(), 1000);
    }
}

// Initialization and dynamic observation
function initialize() {
    addStremioButton();
    chrome.storage.local.get("tmdbApiKey", (result) => {
        if (!result.tmdbApiKey) {
            console.log("[Stremio] TMDB API key not set. Some features may not work optimally.");
        }
    });

    const observer = new MutationObserver(() => {
        if (!document.querySelector('.stremio-button')) {
            addStremioButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', initialize);
initialize();
