/**
 * Chargement des combats publiés (site public + affiche).
 * Visible uniquement si match_metadata.matches_published = true.
 */
(function (global) {
  'use strict';

  var PUBLISHED_KEY = 'matches_published';
  var PUBLISHED_AT_KEY = 'matches_published_at';
  var MATCH_KEY = 'boxingtrophy18_matches';
  var LOCAL_PUBLISHED_KEY = 'boxingtrophy18_matches_published';

  function parseMetaRows(rows) {
    var published = false;
    var publishedAt = null;
    (rows || []).forEach(function (row) {
      if (row.key === PUBLISHED_KEY) published = row.value === 'true';
      if (row.key === PUBLISHED_AT_KEY) publishedAt = row.value || null;
    });
    return { published: published, publishedAt: publishedAt };
  }

  async function fetchPublishState() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      var res = await supabaseClient
        .from('match_metadata')
        .select('key, value')
        .in('key', [PUBLISHED_KEY, PUBLISHED_AT_KEY]);
      if (res.error) throw res.error;
      return parseMetaRows(res.data);
    }
    return {
      published: localStorage.getItem(LOCAL_PUBLISHED_KEY) === 'true',
      publishedAt: localStorage.getItem(LOCAL_PUBLISHED_KEY + '_at'),
    };
  }

  async function loadMatchesRaw() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      var res = await supabaseClient.from('matches').select('*').order('sort_order', { ascending: true });
      if (res.error) throw res.error;
      if (typeof global.GalaPoster !== 'undefined') return global.GalaPoster.latestGeneration(res.data || []);
      return res.data || [];
    }
    try {
      return JSON.parse(localStorage.getItem(MATCH_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function normalizeList(data) {
    if (typeof global.GalaPoster !== 'undefined') {
      global.GalaPoster.normalizeMatches(data);
      global.GalaPoster.assignMatchMeta(data);
    }
    return data;
  }

  /* Interrupteur : true = la carte des combats reste masquée sur le site public
     (accueil + /affiche), même si elle est publiée dans l'admin.
     Activé en attendant les inscriptions du Trophy 20 : la carte en base est celle du Trophy 19.
     Repasser à false quand la nouvelle carte est prête. L'admin n'est pas concerné. */
  var HIDE_PUBLIC_CARD = true;

  async function loadPublishedMatches() {
    if (HIDE_PUBLIC_CARD) {
      return { published: false, publishedAt: null, matches: [] };
    }
    var state = await fetchPublishState();
    if (!state.published) {
      return { published: false, publishedAt: null, matches: [] };
    }
    var matches = normalizeList(await loadMatchesRaw());
    return {
      published: true,
      publishedAt: state.publishedAt,
      matches: matches,
    };
  }

  global.BT18PublishedMatches = {
    PUBLISHED_KEY: PUBLISHED_KEY,
    PUBLISHED_AT_KEY: PUBLISHED_AT_KEY,
    fetchPublishState: fetchPublishState,
    loadPublishedMatches: loadPublishedMatches,
  };
})(typeof window !== 'undefined' ? window : global);
