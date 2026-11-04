/*
 * jQuery-UI-compatible subsets on top of NQ: tabs, autocomplete, swipe, toast. Requires nq.js (toast needs Bootstrap 5).
 */
(function (window) {
    'use strict';
    var NQ = window.NQ;
    if (!NQ) return;
    var doc = document;

    /*** tabs ***/
    function tabsRefresh(root, active) {
        var nav = root.querySelector(':scope > ul');
        if (!nav) return;
        var links = Array.prototype.slice.call(nav.querySelectorAll(':scope > li > a[href^="#"]'));
        var panels = links.map(function (a) { return doc.getElementById(a.getAttribute('href').slice(1)); });
        root.classList.add('ui-tabs');
        nav.classList.add('ui-tabs-nav');
        function show(i, e) {
            if (i < 0 || i >= links.length) i = 0;
            links.forEach(function (a, j) {
                a.parentNode.classList.toggle('ui-tabs-active', i === j);
                a.parentNode.classList.toggle('ui-state-active', i === j);
                a.parentNode.classList.toggle('ui-state-default', i !== j);
                a.setAttribute('aria-selected', i === j ? 'true' : 'false');
                if (panels[j]) { panels[j].classList.add('ui-tabs-panel'); panels[j].style.display = i === j ? '' : 'none'; }
            });
            root.nqTabsActive = i;
            if (e) new NQ(root).trigger('tabsactivate', [{ newTab: new NQ(links[i].parentNode), newPanel: new NQ(panels[i]) }]);
        }
        root.nqTabs = { show: show, links: links };
        links.forEach(function (a, i) {
            a.parentNode.classList.add('ui-tabs-tab');
            if (a.nqTabsBound) return;
            a.nqTabsBound = true;
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var idx = root.nqTabs.links.indexOf(a);
                show(idx, e);
            });
        });
        show(active != null ? active : (root.nqTabsActive || 0));
    }
    NQ.fn.tabs = function (arg, name, value) {
        return this.each(function () {
            var root = this;
            if (arg === 'refresh') return tabsRefresh(root);
            if (arg === 'option' && name === 'active' && value !== undefined) return root.nqTabs && root.nqTabs.show(value, null);
            if (arg === 'option' && name === 'active') return;
            if (arg === 'destroy') { root.classList.remove('ui-tabs'); return; }
            tabsRefresh(root, arg && arg.active !== undefined ? arg.active : (root.nqTabsActive || 0));
        });
    };

    /*** toast (Bootstrap) ***/
    NQ.fn.toast = function (arg) {
        return this.each(function () {
            var t = window.bootstrap.Toast.getOrCreateInstance(this);
            if (arg === undefined || arg === 'show') t.show(); else if (typeof t[arg] === 'function') t[arg]();
        });
    };

    /*** swipe ***/
    NQ.fn.swipe = function (o) {
        o = o || {};
        return this.each(function () {
            var el = this, x0, y0, t0, skip;
            el.addEventListener('touchstart', function (e) {
                var t = e.changedTouches[0];
                x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
                skip = !!(o.excludedElements && e.target.closest && e.target.closest(o.excludedElements));
            }, { passive: true });
            el.addEventListener('touchend', function (e) {
                if (skip) return;
                var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0, th = o.threshold == null ? 75 : o.threshold;
                if (Math.abs(dx) < th || Math.abs(dx) < Math.abs(dy) * 1.5) return;
                var cb = dx < 0 ? o.swipeLeft : o.swipeRight;
                if (typeof cb === 'function') cb.call(el, e, dx < 0 ? 'left' : 'right', Math.abs(dx), Date.now() - t0, 1, []);
            }, { passive: true });
        });
    };

    /*** autocomplete ***/
    function normalize(items) {
        return (items || []).map(function (i) {
            if (typeof i === 'string') return { label: i, value: i };
            var r = {}; for (var k in i) r[k] = i[k];
            r.label = r.label != null ? r.label : r.value;
            r.value = r.value != null ? r.value : r.label;
            return r;
        });
    }

    function acInit(input, o) {
        var s = { input: input, o: o, items: [], index: -1, timer: null, seq: 0 };
        var menu = doc.createElement('ul');
        menu.className = 'ui-autocomplete ui-menu';
        menu.style.display = 'none';
        doc.body.appendChild(menu);
        s.menu = menu;
        menu.nqAutocompleteState = s;
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('aria-autocomplete', 'list');

        function close() { menu.style.display = 'none'; s.index = -1; s.items = []; }
        function highlight(i) {
            s.index = i;
            Array.prototype.forEach.call(menu.children, function (li, j) { li.classList.toggle('ui-state-active', j === i); });
        }
        s.highlight = highlight;
        function choose(i, e) {
            var item = s.items[i];
            if (!item) return;
            var ui = { item: item };
            var res = typeof s.o.select === 'function' ? s.o.select.call(input, e, ui) : undefined;
            input.dispatchEvent(new CustomEvent('autocompleteselect', { bubbles: true, detail: ui }));
            if (res !== false) input.value = item.value;
            close();
        }
        function render(items) {
            s.items = normalize(items);
            menu.innerHTML = '';
            if (!s.items.length) return close();
            s.items.forEach(function (it, i) {
                var li = doc.createElement('li');
                li.className = 'ui-menu-item';
                li.textContent = it.label;
                li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(i, e); });
                li.addEventListener('mouseenter', function () { highlight(i); });
                menu.appendChild(li);
            });
            var r = input.getBoundingClientRect();
            menu.style.position = 'absolute';
            menu.style.left = (r.left + window.pageXOffset) + 'px';
            menu.style.top = (r.bottom + window.pageYOffset) + 'px';
            menu.style.minWidth = r.width + 'px';
            menu.style.display = '';
            highlight(-1);
        }
        function search() {
            var term = input.value, my = ++s.seq;
            if (term.length < (s.o.minLength == null ? 1 : s.o.minLength)) return close();
            var src = s.o.source, respond = function (items) { if (my === s.seq) render(items); };
            if (Array.isArray(src)) {
                var t = term.toLowerCase();
                respond(normalize(src).filter(function (i) { return i.label.toLowerCase().indexOf(t) >= 0; }));
            } else if (typeof src === 'function') src.call(input, { term: term }, respond);
            else if (typeof src === 'string') {
                fetch(src + (src.indexOf('?') < 0 ? '?' : '&') + 'term=' + encodeURIComponent(term))
                    .then(function (r) { return r.json(); }).then(respond).catch(close);
            }
        }
        s.search = search; s.close = close;
        input.addEventListener('input', function () {
            clearTimeout(s.timer);
            s.timer = setTimeout(search, s.o.delay == null ? 300 : s.o.delay);
        });
        input.addEventListener('keydown', function (e) {
            if (menu.style.display === 'none') return;
            var n = s.items.length;
            if (e.key === 'ArrowDown') { highlight((s.index + 1) % n); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { highlight((s.index - 1 + n) % n); e.preventDefault(); }
            else if (e.key === 'Enter' && s.index >= 0) { choose(s.index, e); e.preventDefault(); }
            else if (e.key === 'Escape') close();
        });
        input.addEventListener('blur', function () { setTimeout(close, 150); });
        return s;
    }

    NQ.fn.menu = function (cmd, e, item) {
        if (cmd !== 'focus') return this;
        var li = item && item[0] ? item[0] : item;
        return this.each(function () {
            var s = this.nqAutocompleteState;
            if (s && li) s.highlight(Array.prototype.indexOf.call(this.children, li));
        });
    };

    NQ.fn.autocomplete = function (arg, name, value) {
        if (arg === 'widget') return this[0] && this[0].nqAutocomplete ? new NQ(this[0].nqAutocomplete.menu) : new NQ([]);
        if (arg === 'option' && value === undefined && this[0]) {
            var s0 = this[0].nqAutocomplete;
            if (!s0) return undefined;
            return name === undefined ? s0.o : s0.o[name];
        }
        return this.each(function () {
            var el = this, s = el.nqAutocomplete;
            if (typeof arg === 'string') {
                if (!s) return;
                if (arg === 'close') s.close();
                else if (arg === 'search') s.search();
                else if (arg === 'destroy') { s.close(); s.menu.remove(); delete el.nqAutocomplete; new NQ(el).data('ui-autocomplete', null); }
                else if (arg === 'option') { if (typeof name === 'object') Object.assign(s.o, name); else s.o[name] = value; }
                return;
            }
            if (s) { s.close(); s.menu.remove(); }
            s = acInit(el, arg || {});
            el.nqAutocomplete = s;
            new NQ(el).data('ui-autocomplete', s);
        });
    };
})(window);
