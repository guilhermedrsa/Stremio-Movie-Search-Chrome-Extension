document.addEventListener("DOMContentLoaded", () => {
    const appCheckbox = document.getElementById("useStremioApp");
    const tmdbApiKeyInput = document.getElementById("tmdbApiKey");
    const saveButton = document.getElementById("save");
    const statusDiv = document.getElementById("status");

    // Load saved settings
    chrome.storage.local.get(["useStremioApp", "tmdbApiKey"], (result) => {
        appCheckbox.checked = result.useStremioApp !== undefined ? result.useStremioApp : true;
        tmdbApiKeyInput.value = result.tmdbApiKey || '';
    });

    // Save settings
    saveButton.addEventListener("click", () => {
        const useApp = appCheckbox.checked;
        const tmdbApiKey = tmdbApiKeyInput.value.trim();

        chrome.storage.local.set({
            useStremioApp: useApp,
            tmdbApiKey: tmdbApiKey
        }, () => {
            statusDiv.textContent = "Preferences saved!";
            setTimeout(() => {
                statusDiv.textContent = "";
            }, 2000);
        });
    });
});
