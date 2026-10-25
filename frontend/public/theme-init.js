// Zet het thema vóór het eerste scherm, zodat er geen witte flits ontstaat; ThemeService neemt het daarna over.
(function () {
  try {
    var preference = localStorage.getItem('radchat-theme') || 'system';
    var dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
