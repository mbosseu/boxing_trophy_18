/* ═══════════════════════════════════════════════════════════
   Boxing Trophy 18 — Affiche style GALA PRO (rendu partagé)
   ═══════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    const EVENT_TITLE = 'BOXING TROPHY';
    const EVENT_EDITION = '18';
    const EVENT_DATE = 'VENDREDI 5 JUIN 2026';
    const EVENT_VENUE = 'BOXING CENTER — ST CYPRIEN';
    const EVENT_TIME_PRELIM = '19H00';
    const EVENT_FOOTER = '★ SOIRÉE DE BOXE EXCEPTIONNELLE ! ★';
    const EVENT_LOGO = 'image/affiche1.png';

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function fighterFullName(f) {
        if (!f) return '—';
        return ((f.prenom || '') + ' ' + (f.nom || '')).trim().toUpperCase();
    }

    function matchCategoryLabel(m) {
        var parts = [];
        if (m.niveau) parts.push(String(m.niveau).toUpperCase());
        if (m.categoriePoids) parts.push(String(m.categoriePoids).toUpperCase());
        if (m.sexe) parts.push(String(m.sexe).toUpperCase());
        return parts.join(' | ') || 'COMBAT';
    }

    function computeTier(matchNumber, totalPairs) {
        if (totalPairs <= 0) return 'main_card';
        if (totalPairs === 1) return 'main_event';
        if (matchNumber === totalPairs) return 'main_event';
        if (matchNumber === totalPairs - 1) return 'co_main';
        if (totalPairs >= 8) {
            var prelimCount = Math.min(3, Math.floor(totalPairs * 0.25));
            if (matchNumber <= prelimCount) return 'preliminary';
            if (matchNumber >= totalPairs - 1) return matchNumber === totalPairs ? 'main_event' : 'co_main';
            return 'main_card';
        }
        if (matchNumber === 1) return 'preliminary';
        return 'main_card';
    }

    /** Ordre d’affichage : combat 1 en haut, puis 2, 3… */
    function compareMatchOrder(a, b) {
        var sa = a.sort_order;
        var sb = b.sort_order;
        if (sa != null && sb != null && sa !== sb) return sa - sb;
        return (a.match_number || 0) - (b.match_number || 0);
    }

    function sortMatchesByOrder(matches) {
        if (!matches || !matches.length) return matches;
        matches.sort(compareMatchOrder);
        return matches;
    }

    function renumberPairMatches(matches) {
        if (!matches) return matches;
        var num = 1;
        matches.forEach(function (m, idx) {
            m.sort_order = idx;
            if (isPairMatch(m)) {
                m.type = 'pair';
                m.match_number = num++;
            }
        });
        return matches;
    }

    function assignMatchMeta(matches) {
        sortMatchesByOrder(matches);
        var pairs = matches.filter(function (m) { return m.type === 'pair' || isPairMatch(m); });
        var total = pairs.length;
        var num = 1;
        matches.forEach(function (m) {
            if (!isPairMatch(m) && m.type !== 'pair') return;
            if (m.match_number == null) m.match_number = num;
            if (!m.tier) m.tier = computeTier(m.match_number, total);
            num++;
        });
        return matches;
    }

    function groupByTier(pairs) {
        var groups = {
            main_event: [],
            co_main: [],
            main_card: [],
            preliminary: []
        };
        pairs.forEach(function (m) {
            var tier = m.tier || computeTier(m.match_number, pairs.length);
            if (groups[tier]) groups[tier].push(m);
            else groups.main_card.push(m);
        });
        Object.keys(groups).forEach(function (k) {
            groups[k].sort(function (a, b) { return (a.match_number || 0) - (b.match_number || 0); });
        });
        return groups;
    }

    function cornerClass(side, m, showResults) {
        if (!showResults) return '';
        var w = m.winner;
        if (!w) return '';
        if (w === 'fighter1' && side === 1) return ' is-winner';
        if (w === 'fighter2' && side === 2) return ' is-winner';
        if (w === 'fighter1' && side === 2) return ' is-loser';
        if (w === 'fighter2' && side === 1) return ' is-loser';
        return '';
    }

    function getMatchKey(m, index) {
        return m.id != null ? String(m.id) : 'idx_' + index;
    }

    function photoStyle(f) {
        var url = f && (f.photoUrl || f.photo_url);
        if (!url) return '';
        return ' style="background-image:url(\'' + String(url).replace(/'/g, '%27') + '\');background-size:cover;background-position:center top;"';
    }

    function renderFighterSlot(m, side, size, showResults, options, matchKey) {
        var f = side === 1 ? m.fighter1 : m.fighter2;
        var corner = side === 1 ? 'red' : 'blue';
        var cc = cornerClass(side, m, showResults);
        var showWinner = showResults && m.winner && ((m.winner === 'fighter1' && side === 1) || (m.winner === 'fighter2' && side === 2));
        var interactive = options && options.interactive;
        var clickClass = interactive ? ' gala-fighter--interactive' : '';
        var noPhoto = !(f && (f.photoUrl || f.photo_url));
        var dataAttrs = interactive
            ? ' data-match-key="' + escapeHtml(matchKey) + '" data-side="' + side + '" data-fighter-id="' + escapeHtml((f && f.id) || '') + '" title="Cliquer pour la fiche"'
            : '';
        return (
            '<div class="gala-fighter gala-fighter--' + corner + ' gala-fighter--' + size + cc + clickClass + '"' + dataAttrs + '>' +
                (showWinner ? '<span class="gala-winner-badge">VAINQUEUR</span>' : '') +
                '<div class="gala-photo' + (noPhoto ? ' gala-photo--placeholder' : '') + '"' + photoStyle(f) + '></div>' +
                '<div class="gala-fighter-name">' + escapeHtml(fighterFullName(f)) + '</div>' +
                '<div class="gala-fighter-club">' + escapeHtml((f && f.club) || '—') + '</div>' +
            '</div>'
        );
    }

    function renderVs(size) {
        return '<div class="gala-vs gala-vs--' + size + '"><span>VS</span></div>';
    }

    function renderMatchBlock(m, size, showResults, options, matchKey) {
        var num = m.match_number != null ? m.match_number : '—';
        var cat = matchCategoryLabel(m);
        return (
            '<article class="gala-match gala-match--' + size + '" data-match-id="' + escapeHtml(String(m.id || '')) + '" data-match-key="' + escapeHtml(matchKey) + '">' +
                '<div class="gala-match-num">' + escapeHtml(String(num)) + '</div>' +
                '<div class="gala-match-cat">' + escapeHtml(cat) + '</div>' +
                '<div class="gala-match-body">' +
                    renderFighterSlot(m, 1, size, showResults, options, matchKey) +
                    renderVs(size) +
                    renderFighterSlot(m, 2, size, showResults, options, matchKey) +
                '</div>' +
            '</article>'
        );
    }

    function renderTierBanner(label, extra) {
        return (
            '<div class="gala-tier-banner">' +
                '<span class="gala-tier-star">★</span> ' + escapeHtml(label) +
                (extra ? ' <span class="gala-tier-extra">' + escapeHtml(extra) + '</span>' : '') +
                ' <span class="gala-tier-star">★</span>' +
            '</div>'
        );
    }

    function renderMainCardGrid(items, showResults, options, matchKeyFn) {
        if (!items.length) return '';
        var rows = [];
        var i = 0;
        while (i < items.length) {
            var rowSize = items.length - i >= 4 && i + 4 <= items.length && rows.length > 0 ? 4 : Math.min(3, items.length - i);
            if (rows.length === 0 && items.length >= 7) rowSize = Math.min(3, items.length);
            rows.push(items.slice(i, i + rowSize));
            i += rowSize;
        }
        return rows.map(function (row) {
            return '<div class="gala-row gala-row--card">' + row.map(function (m) {
                return renderMatchBlock(m, 'sm', showResults, options, matchKeyFn(m));
            }).join('') + '</div>';
        }).join('');
    }

    function renderWaitingSection(waiting, options) {
        if (!waiting.length) return '';
        var html = '<section class="gala-section gala-section--waiting">';
        html += renderTierBanner('COMBATTANTS EN ATTENTE D\'ADVERSAIRE');
        html += '<div class="gala-waiting-grid">';
        waiting.forEach(function (m, idx) {
            var f = m.fighter1;
            var key = 'wait_' + (m.id != null ? m.id : idx);
            var interactive = options && options.interactive;
            html +=
                '<div class="gala-waiting-card' + (interactive ? ' gala-fighter--interactive' : '') + '"' +
                (interactive ? ' data-match-key="' + escapeHtml(key) + '" data-side="1" data-fighter-id="' + escapeHtml((f && f.id) || '') + '"' : '') +
                '>' +
                '<div class="gala-photo gala-photo--waiting"' + photoStyle(f) + '></div>' +
                '<div class="gala-fighter-name">' + escapeHtml(fighterFullName(f)) + '</div>' +
                '<div class="gala-fighter-club">' + escapeHtml((f && f.club) || '—') + '</div>' +
                '<div class="gala-waiting-meta">' + escapeHtml(matchCategoryLabel(m)) + '</div>' +
                '</div>';
        });
        html += '</div></section>';
        return html;
    }

    function normalizeMatches(matches) {
        if (!matches) return;
        matches.forEach(function (m) {
            if (m.fighter1 && m.fighter2) {
                m.type = 'pair';
            } else if (m.fighter1 && !m.fighter2) {
                m.type = 'waiting';
            }
        });
    }

    function isPairMatch(m) {
        return !!(m && m.fighter1 && m.fighter2);
    }

    /** Grille compacte type carte UFC — une page à l'impression */
    function renderBoutCorner(m, side, showResults, options, matchKey) {
        var f = side === 1 ? m.fighter1 : m.fighter2;
        var corner = side === 1 ? 'red' : 'blue';
        var cc = cornerClass(side, m, showResults);
        var interactive = options && options.interactive;
        var showWinner = showResults && m.winner && ((m.winner === 'fighter1' && side === 1) || (m.winner === 'fighter2' && side === 2));
        var noPhoto = !(f && (f.photoUrl || f.photo_url));
        var dataAttrs = interactive
            ? ' data-match-key="' + escapeHtml(matchKey) + '" data-side="' + side + '" data-fighter-id="' + escapeHtml((f && f.id) || '') + '"'
            : '';
        return (
            '<div class="gala-bout-corner gala-bout-corner--' + corner + cc + (interactive ? ' gala-fighter--interactive' : '') + '"' + dataAttrs + '>' +
                (showWinner ? '<span class="gala-winner-badge">W</span>' : '') +
                '<div class="gala-bout-photo' + (noPhoto ? ' gala-photo--placeholder' : '') + '"' + photoStyle(f) + '></div>' +
                '<div class="gala-bout-name">' + escapeHtml(fighterFullName(f)) + '</div>' +
                '<div class="gala-bout-club">' + escapeHtml((f && f.club) || '') + '</div>' +
            '</div>'
        );
    }

    function renderProHeader(showResults, pairCount) {
        var html = '<header class="gala-header gala-header--pro">';
        html += '<div class="gala-header-pro-row">';
        html += '<img class="gala-logo" src="' + escapeHtml(EVENT_LOGO) + '" alt="" width="56" height="56" />';
        html += '<div class="gala-header-pro-text">';
        html += '<p class="gala-venue">' + escapeHtml(EVENT_VENUE) + '</p>';
        html += '<h1 class="gala-title gala-title--pro">' + escapeHtml(EVENT_TITLE) +
            ' <span class="gala-edition">' + escapeHtml(EVENT_EDITION) + '</span></h1>';
        html += '<p class="gala-date gala-date--pro">' + escapeHtml(EVENT_DATE) + ' · DÈS ' + escapeHtml(EVENT_TIME_PRELIM) + '</p>';
        if (showResults) {
            html += '<p class="gala-subtitle-results">RÉSULTATS OFFICIELS</p>';
        }
        html += '</div>';
        if (pairCount > 0) {
            html += '<div class="gala-stats-pill"><span class="gala-stats-num">' + pairCount + '</span><span class="gala-stats-label">COMBATS</span></div>';
        }
        html += '</div>';
        html += '<div class="gala-header-rule"></div>';
        html += '</header>';
        return html;
    }

    function renderBoutCard(m, showResults, options, matchKey) {
        var num = m.match_number != null ? m.match_number : '';
        var cat = matchCategoryLabel(m);
        var tierLabel = (m.tier || '').replace(/_/g, ' ').toUpperCase();
        var featured = m.tier === 'main_event' || m.tier === 'co_main' ? ' gala-bout--featured' : '';
        var interactive = options && options.interactive;
        var metaClick = interactive ? ' gala-bout-meta--interactive' : '';
        var metaTitle = interactive ? ' title="Voir les détails du combat"' : '';
        return (
            '<article class="gala-bout' + featured + '" data-match-key="' + escapeHtml(matchKey) + '">' +
                '<div class="gala-bout-head' + metaClick + '"' + metaTitle + '>' +
                    '<span class="gala-bout-num">' + escapeHtml(String(num)) + '</span>' +
                    '<span class="gala-bout-cat">' + escapeHtml(cat) + '</span>' +
                    (tierLabel ? '<span class="gala-bout-tier">' + escapeHtml(tierLabel) + '</span>' : '') +
                '</div>' +
                '<div class="gala-bout-row">' +
                    renderBoutCorner(m, 1, showResults, options, matchKey) +
                    '<div class="gala-bout-vs' + metaClick + '"' + metaTitle + '>VS</div>' +
                    renderBoutCorner(m, 2, showResults, options, matchKey) +
                '</div>' +
            '</article>'
        );
    }

    function buildUfcPosterHtml(matches, options) {
        normalizeMatches(matches);
        assignMatchMeta(matches);
        var pairs = matches.filter(isPairMatch).slice().sort(compareMatchOrder);
        var waiting = matches.filter(function (m) { return m.type === 'waiting' && m.fighter1; });
        var hasWinners = pairs.some(function (m) {
            return m.winner === 'fighter1' || m.winner === 'fighter2';
        });
        var showResults = options.showResults != null ? !!options.showResults : hasWinners;
        var modeClass = showResults ? ' gala-poster--results' : '';

        var html = '<div class="gala-poster gala-poster--ufc gala-poster--pro' + modeClass + '">';

        html += renderProHeader(showResults, pairs.length);
        html += '<div class="gala-corners-legend">';
        html += '<span><i class="gala-dot gala-dot--red"></i> COIN ROUGE</span>';
        html += '<span><i class="gala-dot gala-dot--blue"></i> COIN BLEU</span>';
        html += '</div>';

        html += '<div class="gala-ufc-grid">';
        pairs.forEach(function (m) {
            var i = matches.indexOf(m);
            html += renderBoutCard(m, showResults, options, getMatchKey(m, i >= 0 ? i : 0));
        });
        html += '</div>';

        var showWaiting = !options.forPrint && options.includeWaiting !== false && waiting.length;
        if (showWaiting) {
            html += '<section class="gala-ufc-waiting">';
            html += '<div class="gala-tier-banner gala-tier-banner--compact">EN ATTENTE</div>';
            html += '<div class="gala-waiting-chips">';
            waiting.forEach(function (m, idx) {
                var f = m.fighter1;
                var key = 'wait_' + (m.id != null ? m.id : idx);
                var interactive = options && options.interactive;
                html +=
                    '<div class="gala-waiting-chip' + (interactive ? ' gala-fighter--interactive' : '') + '"' +
                    (interactive ? ' data-match-key="' + escapeHtml(key) + '" data-side="1" data-fighter-id="' + escapeHtml((f && f.id) || '') + '"' : '') +
                    '>' +
                    '<span class="gala-waiting-chip-photo"' + photoStyle(f) + '></span>' +
                    '<span>' + escapeHtml(fighterFullName(f)) + '</span>' +
                    '</div>';
            });
            html += '</div></section>';
        }

        html += '<footer class="gala-footer gala-footer--compact">' + escapeHtml(EVENT_FOOTER) + '</footer>';
        html += '</div>';
        return html;
    }

    function buildPosterHtml(matches, options) {
        options = options || {};
        if (options.layout !== 'featured') {
            return buildUfcPosterHtml(matches, options);
        }
        normalizeMatches(matches);
        assignMatchMeta(matches);
        var pairs = matches.filter(isPairMatch);
        var waiting = matches.filter(function (m) { return m.type === 'waiting' && m.fighter1; });
        var groups = groupByTier(pairs);
        var hasWinners = pairs.some(function (m) {
            return m.winner === 'fighter1' || m.winner === 'fighter2';
        });
        var showResults = options.showResults != null ? !!options.showResults : hasWinners;
        var modeClass = showResults ? ' gala-poster--results' : '';
        function matchKeyFn(m) {
            var i = matches.indexOf(m);
            return getMatchKey(m, i >= 0 ? i : 0);
        }

        var html = '<div class="gala-poster' + modeClass + '">';

        html += '<header class="gala-header">';
        html += '<div class="gala-legend gala-legend--left">';
        html += '<span><i class="gala-dot gala-dot--red"></i> COIN ROUGE</span>';
        html += '<span><i class="gala-dot gala-dot--blue"></i> COIN BLEU</span>';
        html += '</div>';
        html += '<div class="gala-legend gala-legend--right">';
        html += '<span>08 OZ</span><span>10 OZ</span><span>12 OZ</span>';
        html += '</div>';
        html += '<h1 class="gala-title">' + escapeHtml(EVENT_TITLE) + ' <span class="gala-edition">' + escapeHtml(EVENT_EDITION) + '</span></h1>';
        html += '<p class="gala-date">' + escapeHtml(EVENT_DATE) + '</p>';
        if (showResults) {
            html += '<p class="gala-subtitle-results">RÉSULTATS OFFICIELS</p>';
        }
        html += '</header>';

        if (groups.main_event.length) {
            html += '<section class="gala-section gala-section--main">';
            html += renderTierBanner('MAIN EVENT');
            html += '<div class="gala-featured">' + groups.main_event.map(function (m) {
                return renderMatchBlock(m, 'xl', showResults, options, matchKeyFn(m));
            }).join('') + '</div></section>';
        }

        if (groups.co_main.length) {
            html += '<section class="gala-section gala-section--co">';
            html += renderTierBanner('CO-MAIN EVENT');
            html += '<div class="gala-featured gala-featured--co">' + groups.co_main.map(function (m) {
                return renderMatchBlock(m, 'lg', showResults, options, matchKeyFn(m));
            }).join('') + '</div></section>';
        }

        if (groups.main_card.length) {
            html += '<section class="gala-section gala-section--card">';
            html += renderTierBanner('CARTE PRINCIPALE');
            html += renderMainCardGrid(groups.main_card, showResults, options, matchKeyFn);
            html += '</section>';
        }

        if (groups.preliminary.length) {
            html += '<section class="gala-section gala-section--prelim">';
            html += renderTierBanner('CARTE PRÉLIMINAIRE', EVENT_TIME_PRELIM);
            html += '<div class="gala-row gala-row--prelim">' + groups.preliminary.map(function (m) {
                return renderMatchBlock(m, 'sm', showResults, options, matchKeyFn(m));
            }).join('') + '</div></section>';
        }

        var showWaitingFeatured = !options.forPrint && options.includeWaiting !== false && waiting.length;
        if (showWaitingFeatured) {
            html += renderWaitingSection(waiting, options);
        }

        html += '<footer class="gala-footer">' + escapeHtml(EVENT_FOOTER) + '</footer>';
        html += '</div>';
        return html;
    }

    function renderPoster(container, matches, options) {
        if (!container) return;
        container.innerHTML = buildPosterHtml(matches, options);
    }

    function preparePrintFit(container, matches, options) {
        if (!container) return;
        if (matches && matches.length) {
            renderPoster(container, matches, Object.assign({}, options || {}, {
                forPrint: true,
                includeWaiting: false,
                interactive: false
            }));
        }
        var poster = container.querySelector('.gala-poster');
        if (!poster) return;
        poster.classList.add('gala-poster--printing');
        container.style.removeProperty('--print-scale');
        var pageH = 700;
        var h = poster.scrollHeight;
        if (h > pageH) {
            var scale = Math.max(0.32, pageH / h);
            container.style.setProperty('--print-scale', String(scale));
        }
    }

    function restoreScreenPoster(container, matches, options) {
        if (!container || !matches) return;
        renderPoster(container, matches, Object.assign({}, options || {}, {
            forPrint: false,
            includeWaiting: true,
            interactive: options && options.interactive
        }));
    }

    global.GalaPoster = {
        EVENT_TITLE: EVENT_TITLE,
        EVENT_DATE: EVENT_DATE,
        compareMatchOrder: compareMatchOrder,
        sortMatchesByOrder: sortMatchesByOrder,
        renumberPairMatches: renumberPairMatches,
        assignMatchMeta: assignMatchMeta,
        normalizeMatches: normalizeMatches,
        isPairMatch: isPairMatch,
        computeTier: computeTier,
        buildPosterHtml: buildPosterHtml,
        renderPoster: renderPoster,
        preparePrintFit: preparePrintFit,
        restoreScreenPoster: restoreScreenPoster,
        EVENT_VENUE: EVENT_VENUE,
        escapeHtml: escapeHtml,
        fighterFullName: fighterFullName,
        getMatchKey: getMatchKey,
        hasWinners: function (matches) {
            normalizeMatches(matches);
            return matches.filter(isPairMatch).some(function (m) {
                return m.winner === 'fighter1' || m.winner === 'fighter2';
            });
        }
    };
})(typeof window !== 'undefined' ? window : global);
