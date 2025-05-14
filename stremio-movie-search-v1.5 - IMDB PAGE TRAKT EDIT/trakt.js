// Extract IMDb ID and initialize the Stremio button
function initStremioButton() {
    // Verificar se estamos em uma página de episódio de série
    const isEpisodePage = /\/shows\/[^\/]+\/seasons\/\d+\/episodes\/\d+/.test(window.location.pathname);
    
    if (isEpisodePage) {
        // Para episódios, pegar o link principal da série no IMDb
        const imdbLink = document.querySelector('h1 a[href*="imdb.com/title/tt"], .title-container a[href*="imdb.com/title/tt"]');
        if (imdbLink) {
            const imdbId = imdbLink.href.match(/tt\d+/)?.[0];
            if (imdbId) {
                createStremioButton(imdbId, 'series');
            }
        }
    } else {
        // Para filmes e temporadas, manter o comportamento original
        const imdbLink = document.querySelector('a[href*="imdb.com/title/tt"]');
        if (imdbLink) {
            const imdbId = imdbLink.href.match(/tt\d+/)?.[0];
            if (imdbId) {
                // Detectar se é filme ou temporada
                const isMovie = /\/movies\//.test(window.location.pathname);
                const contentType = isMovie ? 'movie' : 'series';
                createStremioButton(imdbId, contentType);
            }
        }
    }

    function createStremioButton(imdbId, contentType) {
        if (!imdbId) return;
        if (document.querySelector('.stremio-button')) return;

        // Criar botão do Stremio
        const stremioIcon = document.createElement('img');
        stremioIcon.src = chrome.runtime.getURL("icons/stremio.png");
        stremioIcon.alt = "Stremio";
        stremioIcon.className = "stremio-button";
        stremioIcon.style = "width: 32px; height: 33px; margin-left: 16px; cursor: pointer; vertical-align: middle;";

        stremioIcon.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.storage.local.get("useStremioApp", (result) => {
                const useApp = result.useStremioApp !== undefined ? result.useStremioApp : true;
                const stremioUrl = useApp 
                    ? `stremio://detail/${contentType}/${imdbId}` 
                    : `https://web.stremio.com/#/detail/${contentType}/${imdbId}`;

                if (useApp) {
                    const appLink = document.createElement("a");
                    appLink.href = stremioUrl;
                    appLink.click();
                } else {
                    window.open(stremioUrl, '_blank');
                }
            });
        });

        insertStremioButton(stremioIcon);
    }

    function insertStremioButton(stremioIcon) {
        const insertionPoints = [
            document.querySelector('h1'),
            document.querySelector('.title-container'),
            document.querySelector('header'),
            document.querySelector('main')
        ];

        for (const point of insertionPoints) {
            if (point) {
                point.appendChild(stremioIcon);
                break;
            }
        }
    }
}

// Observer para conteúdo dinâmico
const observer = new MutationObserver(() => {
    if (!document.querySelector('.stremio-button')) {
        initStremioButton();
    }
});
observer.observe(document.body, { childList: true, subtree: true });

// Inicialização
document.addEventListener('DOMContentLoaded', initStremioButton);
initStremioButton();
