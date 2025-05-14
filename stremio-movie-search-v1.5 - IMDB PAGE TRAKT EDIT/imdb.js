// Extract IMDb ID from the current URL (supports /title/tt1234567 and /pt/title/tt1234567)
const imdbId = window.location.pathname.match(/\/(?:[a-z]{2}\/)?title\/(tt\d+)/)?.[1];

if (imdbId) {
    // Determine if it's a movie or TV series
    const isSeries =
        document.querySelector('.bp_heading')?.textContent.includes('Series') ||
        document.querySelector('meta[property="og:type"]')?.content.includes('tv_show');

    // Create Stremio icon as a button (no text)
    const stremioIcon = document.createElement('img');
    stremioIcon.src = chrome.runtime.getURL("icons/stremio.png");
    stremioIcon.alt = "Stremio";
    stremioIcon.className = "stremio-watch-button";
    stremioIcon.style = `
        width: 34px;
        height: 34px;
        margin-left: 3px;
        cursor: pointer;
        vertical-align: middle;
        padding: 4px;
        box-sizing: content-box;
        display: inline-block;
    `;

    // Add click event handler
    stremioIcon.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.storage.local.get("useStremioApp", (result) => {
            const useApp = result.useStremioApp !== undefined ? result.useStremioApp : true;
            const stremioUrl = isSeries
                ? (useApp ? `stremio://detail/series/${imdbId}` : `https://web.stremio.com/#/detail/series/${imdbId}`)
                : (useApp ? `stremio://detail/movie/${imdbId}/${imdbId}` : `https://web.stremio.com/#/detail/movie/${imdbId}/${imdbId}`);
            if (useApp) {
                const appLink = document.createElement("a");
                appLink.href = stremioUrl;
                appLink.click();
            } else {
                window.open(stremioUrl, '_blank');
            }
        });
    });

    // Function to insert the icon immediately after .hero__primary-text
    function insertIcon() {
        const primaryText = document.querySelector('.hero__primary-text');
        if (primaryText) {
            // Avoid inserting multiple times
            if (!primaryText.parentNode.querySelector('.stremio-watch-button')) {
                // Insert after the primary text
                primaryText.insertAdjacentElement('afterend', stremioIcon);
            }
        } else {
            // Try again later if not found (dynamic loading)
            setTimeout(insertIcon, 1000);
        }
    }

    insertIcon();

    // Also observe for dynamic changes (e.g., navigation in SPA)
    const observer = new MutationObserver(() => {
        if (!document.querySelector('.stremio-watch-button')) {
            insertIcon();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
