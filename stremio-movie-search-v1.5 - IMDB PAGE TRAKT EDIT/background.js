// Background script for IMDb and OMDb API requests

// Respond to messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Process IMDb search requests
    if (request.action === "searchImdb") {
        const searchUrl = `https://www.imdb.com/find?q=${encodeURIComponent(request.title)}${request.year ? '+' + request.year : ''}&s=tt&ttype=ft&ref_=fn_ft`;
        fetch(searchUrl)
            .then(response => response.text())
            .then(html => {
                const match = html.match(/\/title\/(tt\d+)\//);
                sendResponse({imdbId: match ? match[1] : null});
            })
            .catch(error => {
                console.error('Background fetch error:', error);
                sendResponse({imdbId: null});
            });
        return true; // Necessary for async response
    }

    // Process OMDb API requests
    if (request.action === "searchOMDb") {
        const url = `https://www.omdbapi.com/?apikey=64541305&t=${encodeURIComponent(request.title)}${request.year ? '&y=' + request.year : ''}`;
        fetch(url)
            .then(response => response.json())
            .then(data => {
                sendResponse({
                    imdbId: (data.Response === "True" && data.imdbID) ? data.imdbID : null
                });
            })
            .catch(error => {
                console.error('OMDb API error:', error);
                sendResponse({imdbId: null});
            });
        return true; // Necessary for async response
    }

    // Get content type from IMDb ID
    if (request.action === "getContentType") {
        const url = `https://www.omdbapi.com/?apikey=64541305&i=${request.imdbId}`;
        fetch(url)
            .then(response => response.json())
            .then(data => {
                sendResponse({
                    type: (data.Response === "True") ? data.Type : null
                });
            })
            .catch(error => {
                console.error('OMDb API error:', error);
                sendResponse({type: null});
            });
        return true; // Necessary for async response
    }
});
