    // The radio marks the favourite, the cross eliminates a tile, and the badge under them says
    // how mature that version is. Elimination and maturity are two separate states: gathering a
    // tile never writes the maturity key, and marking a tile never moves it. All three states
    // live in localStorage keyed by letter, so the triage survives a reload and every later
    // production batch.
    const store = { elim: '{KEY_PREFIX}-eliminated', pick: '{KEY_PREFIX}-pick',
                    final: '{KEY_PREFIX}-final', views: '{KEY_PREFIX}-view' };
    const tiles = () => Array.from(document.querySelectorAll('.candidate[data-letter]'));
    // The crosses the review drew are the seed for a first visit only; once the reader touches a
    // cross, their own list is the truth and no control on the page overwrites it.
    const defaults = () => tiles()
      .filter((t) => t.dataset.defaultEliminated === 'true').map((t) => t.dataset.letter);
    // Maturity is seeded the same way: an entry the reviewer ticked in the manifest is a final
    // version on the first visit, and the reader's own marks take over from there.
    const defaultsFinal = () => tiles()
      .filter((t) => t.dataset.defaultFinal === 'true').map((t) => t.dataset.letter);
    const eliminated = () => {
      const raw = localStorage.getItem(store.elim);
      return new Set(raw === null ? defaults() : JSON.parse(raw));
    };
    const finals = () => {
      const raw = localStorage.getItem(store.final);
      return new Set(raw === null ? defaultsFinal() : JSON.parse(raw));
    };
    // Eliminated tiles start gathered, which is the layout every earlier round used.
    const hideElim = () => {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(store.views) || 'null'); } catch (e) { raw = null; }
      return raw ? raw.hideElim !== false : true;
    };
    const saveView = () => localStorage.setItem(store.views, JSON.stringify({ hideElim: hideElim() }));
    // Only the tiles on screen in Propositions de design; the two maturity buttons act on those,
    // never on a tile the reader has gathered in Versions eliminees.
    const designTiles = () => Array.from(document.querySelectorAll('#design-section .candidate'));
    const FINAL_TEXT = '{FINAL_TEXT}';
    const WORK_TEXT = '{WORK_TEXT}';
    const badgeText = (on) => (on ? FINAL_TEXT : WORK_TEXT);
    const badgeHint = (on) => (on ? '{FINAL_HINT}'
                                 : '{WORK_HINT}');
    const THEME_NAMES = Array.from(document.querySelectorAll('#design-section .grid[data-theme]'))
      .map((g) => g.dataset.theme);
    const gridIn = (section, theme) =>
      document.querySelector('#' + section + ' .grid[data-theme="' + theme + '"]');
    // A comment node left in the tile's own spot: restoring puts the tile back at its exact
    // former slot and order instead of at the end of the section.
    const origins = new Map();

    function placeOrigins() {
      tiles().forEach((tile) => {
        if (origins.has(tile.dataset.letter)) return;
        const ph = document.createComment(' tile-slot:' + tile.dataset.letter + ' ');
        origins.set(tile.dataset.letter, ph);
        tile.parentNode.insertBefore(ph, tile);
      });
    }
    function layout() {
      const gather = hideElim();
      tiles().forEach((tile) => {
        if (gather && eliminated().has(tile.dataset.letter)) {
          const target = gridIn('eliminated-section', tile.dataset.theme);
          if (target && tile.parentElement !== target) target.appendChild(tile);
          return;
        }
        const ph = origins.get(tile.dataset.letter);
        if (ph && ph.parentNode) {
          if (ph.parentNode === tile.parentNode && ph.previousSibling === tile) return;
          ph.parentNode.insertBefore(tile, ph);
        } else if (tile.parentElement) { tile.parentElement.appendChild(tile); }
      });
      document.querySelectorAll('.grid').forEach((grid) => {
        grid.classList.toggle('is-empty', grid.children.length === 0);
      });
    }
    // Every sub-section legend reads "<tiles on screen> / <tiles in the theme, eliminated
    // included>", in both the design section and the eliminated section.
    function syncCounts() {
      THEME_NAMES.forEach((theme) => {
        const total = tiles().filter((t) => t.dataset.theme === theme).length;
        const d = gridIn('design-section', theme);
        const e = gridIn('eliminated-section', theme);
        const set = (id, n) => {
          const cell = document.querySelector('#' + id + ' .tcount[data-theme="' + theme + '"]');
          if (cell) cell.textContent = n + ' / ' + total;
        };
        set('design-section', d ? d.querySelectorAll('.candidate').length : 0);
        set('eliminated-section', e ? e.querySelectorAll('.candidate').length : 0);
      });
    }
    function syncLabels() {
      const el = document.getElementById('hide-elim');
      // A button always offers the action it performs, so the label flips with the state.
      el.textContent = hideElim() ? '{BAR_SHOW_LABEL}'
                                 : '{BAR_HIDE_LABEL}';
      el.title = '{BAR_TOGGLE_TITLE}';
      const mark = document.getElementById('final-count');
      if (mark) mark.textContent = String(designTiles().length);
      syncCounts();
    }
    function layoutAfter() { layout(); syncLabels(); }
    function refreshAll() { refresh(); layout(); syncLabels(); }

    function refresh() {
      const gone = eliminated();
      const fin = finals();
      let kept = 0;
      tiles().forEach((tile) => {
        const letter = tile.dataset.letter;
        const off = gone.has(letter);
        tile.classList.toggle('eliminated', off);
        tile.querySelector('.eliminate').setAttribute('aria-pressed', String(off));
        const badge = tile.querySelector('.ver-badge');
        if (badge) {
          const isFinal = fin.has(letter);
          badge.classList.toggle('final', isFinal);
          badge.classList.toggle('work', !isFinal);
          badge.setAttribute('aria-pressed', String(isFinal));
          badge.textContent = badgeText(isFinal);
          badge.title = letter + ' : ' + badgeText(isFinal) + ' — ' + badgeHint(isFinal);
          badge.setAttribute('aria-label', badge.title);
        }
        if (!off) kept += 1;
      });
      document.getElementById('kept-count').textContent = String(kept);
      document.getElementById('gone-count').textContent = String(gone.size);
      document.getElementById('elim-count').textContent = String(gone.size);
      const pick = localStorage.getItem(store.pick) || '';
      const radio = document.getElementById(pick.toLowerCase());
      if (radio) radio.checked = true;
    }

    function setFinal(letters, on) {
      const fin = finals();
      letters.forEach((l) => (on ? fin.add(l) : fin.delete(l)));
      localStorage.setItem(store.final, JSON.stringify(Array.from(fin)));
      refresh();
      layoutAfter();
    }

    document.addEventListener('click', (event) => {
      const btn = event.target.closest('.eliminate');
      if (btn) {
        const gone = eliminated();
        const letter = btn.dataset.letter;
        if (gone.has(letter)) gone.delete(letter); else gone.add(letter);
        localStorage.setItem(store.elim, JSON.stringify(Array.from(gone)));
        refresh();
        layoutAfter();
        return;
      }
      const radio = event.target.closest('input[name="favorite"]');
      if (radio) {
        localStorage.setItem(store.pick, radio.value);
        refresh();
        layoutAfter();
        return;
      }
      // No control rewinds the reader's own elimination list any more: defaults() is only the
      // data-default-eliminated seed of a first visit.
      if (event.target.id === 'show-all') {
        localStorage.setItem(store.elim, '[]');
        refresh();
        layoutAfter();
      }
      if (event.target.id === 'show-all-versions') {
        setFinal(designTiles().map((t) => t.dataset.letter), false);
      }
      if (event.target.id === 'mark-all-final') {
        setFinal(designTiles().map((t) => t.dataset.letter), true);
      }
    });
    function initBadges() {
      tiles().forEach((t) => {
        if (t.querySelector('.ver-badge') || !t.querySelector('input[name="favorite"]')) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ver-badge work';
        b.dataset.letter = t.dataset.letter;
        b.setAttribute('aria-pressed', 'false');
        b.textContent = WORK_TEXT;
        t.querySelector('input[name="favorite"]').before(b);
      });
    }
    function badgeClick(event) {
      const badge = event.target.closest('.ver-badge');
      if (!badge) return;
      setFinal([badge.dataset.letter], !finals().has(badge.dataset.letter));
    }
    // The footer states where the SVGs live, in the form the reader's own OS prints. No literal
    // separator is written here: the backslash is built by code so the source stays plain.
    function iconsFolder() {
      const B = String.fromCharCode(92);
      const p = decodeURIComponent(location.pathname);
      const dir = p.slice(0, p.lastIndexOf('/'));
      const isWin = /Win/i.test(navigator.platform || '') || /Windows/i.test(navigator.userAgent || '');
      if (!isWin) return dir;
      const host = (location.hostname && location.hostname !== 'localhost') ? location.hostname : '';
      const body = (host ? host + dir : dir.slice(1)).split('/').join(B);
      return host ? B + B + body : body;
    }

    document.addEventListener('click', badgeClick);
    document.getElementById('hide-elim').addEventListener('click', () => {
      localStorage.setItem(store.views, JSON.stringify({ hideElim: !hideElim() }));
      layout();
      syncLabels();
    });

    const folderCell = document.getElementById('icons-folder');
    if (folderCell) folderCell.textContent = iconsFolder();
    initBadges();
    placeOrigins();
    refreshAll();
