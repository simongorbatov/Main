// Clicking the toolbar icon (or Alt+Shift+D) opens the side panel and checks the current tab.
// That click is also what grants activeTab, which lets the panel read the page.
// (Opening the panel with openPanelOnActionClick instead would not grant activeTab.)
chrome.action.onClicked.addListener((tab) => {
  // open() has to run inside the click's user gesture, so it goes first.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  chrome.storage.session.set({ pendingCheck: { tabId: tab.id, at: Date.now() } }).then(() => {
    // An already-open panel hears this; a panel that is still loading picks up pendingCheck itself.
    chrome.runtime.sendMessage({ type: "check-tab" }).catch(() => {});
  });
});
