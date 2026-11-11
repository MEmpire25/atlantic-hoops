// Theme switch shared by both pages. A classic script (not a module) loaded in <head> so the saved theme is applied
// before the first paint and a light-theme visitor does not see a dark flash. Dark is the default.
(function () {
  var STORAGE_KEY = 'ah-theme';

  function savedTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (error) { return null; }   // storage can be blocked
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    var button = document.getElementById('theme');
    if (button) button.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
  }

  function rememberTheme(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (error) { /* the choice just will not persist */ }
  }

  applyTheme(savedTheme() === 'light' ? 'light' : 'dark');

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.getElementById('theme');
    applyTheme(document.documentElement.dataset.theme);   // now the button exists, set its label
    button.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      rememberTheme(next);
    });
  });
})();
