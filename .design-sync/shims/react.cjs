// Resolves react to the page's window.React (the vendored copy the cards load).
module.exports = (typeof window !== "undefined" && window.React) || {};
