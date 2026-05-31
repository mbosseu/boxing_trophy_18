/**
 * Section « Carte des combats » sur la page d'accueil (index.html).
 */
function initHomeCombats() {
  var section = document.getElementById('carte-combats');
  var soon = document.getElementById('homeCombatsSoon');
  var publishedBlock = document.getElementById('homeCombatsPublished');
  var wrap = document.getElementById('homePosterWrap');
  var desc = document.getElementById('homeCombatsDesc');

  if (!section || typeof BT18PublishedMatches === 'undefined') return;

  function showSoon() {
    if (soon) soon.hidden = false;
    if (publishedBlock) publishedBlock.hidden = true;
    if (desc) {
      desc.textContent =
        'La carte des combats sera affichée ici dès sa publication par l’organisation.';
    }
  }

  function showPublished(matches, publishedAt) {
    var pairs = matches.filter(function (m) {
      return m.type === 'pair' && m.fighter1 && m.fighter2;
    });
    if (!pairs.length) {
      showSoon();
      return;
    }

    if (soon) soon.hidden = true;
    if (publishedBlock) publishedBlock.hidden = false;

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
        showSoon();
        return;
      }
      showPublished(result.matches, result.publishedAt);
    })
    .catch(function () {
      showSoon();
    });
}

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('carte-combats')) {
    initHomeCombats();
  }
});
