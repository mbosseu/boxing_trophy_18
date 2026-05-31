/**
 * Section « Carte des combats » sur la page d'accueil (index.html).
 */
function initHomeCombats() {
  var section = document.getElementById('carte-combats');
  var wrap = document.getElementById('homePosterWrap');
  var empty = document.getElementById('homeCombatsEmpty');
  var desc = document.getElementById('homeCombatsDesc');
  var navLink = document.getElementById('navCarteCombats');

  if (!section || typeof BT18PublishedMatches === 'undefined') return;

  function showEmpty() {
    section.hidden = true;
    if (empty) empty.hidden = false;
  }

  function render(matches, publishedAt) {
    var pairs = matches.filter(function (m) {
      return m.type === 'pair' && m.fighter1 && m.fighter2;
    });
    if (!pairs.length) {
      showEmpty();
      return;
    }

    section.hidden = false;
    if (empty) empty.hidden = true;
    if (navLink) navLink.classList.remove('nav-link--hidden');

    if (desc && publishedAt) {
      try {
        var d = new Date(publishedAt);
        desc.textContent =
          'Programme officiel publié le ' +
          d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) +
          ' à ' +
          d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) +
          '.';
      } catch (e) {
        desc.textContent = 'Les affrontements officiels du Boxing Trophy 18.';
      }
    }

    if (wrap && typeof GalaPoster !== 'undefined') {
      var hasWinners = GalaPoster.hasWinners(matches);
      GalaPoster.renderPoster(wrap, matches, {
        interactive: false,
        showResults: hasWinners,
        includeWaiting: false,
      });
    }
  }

  BT18PublishedMatches.loadPublishedMatches()
    .then(function (result) {
      if (!result.published) {
        showEmpty();
        return;
      }
      render(result.matches, result.publishedAt);
    })
    .catch(function () {
      showEmpty();
    });
}

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('carte-combats')) {
    initHomeCombats();
  }
});
