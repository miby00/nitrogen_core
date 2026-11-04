/*
 * NQ.fn.draggable / NQ.fn.droppable: a subset of the jQuery UI interaction API
 * implemented with Pointer Events. Requires nq.js.
 *
 * draggable options: handle, helper ('original'|'clone'|function), revert (true|false|'valid'|'invalid'),
 *   distance, axis ('x'|'y'), containment ('parent'|'document'|'window'|selector|element),
 *   appendTo, zIndex, cancel, start/drag/stop callbacks.
 *   Events 'dragstart', 'drag', 'dragstop' are triggered with (event, ui).
 * droppable options: accept (selector|function), activeClass, hoverClass,
 *   tolerance ('intersect'|'pointer'|'fit'|'touch'), greedy, drop/over/out/activate/deactivate callbacks.
 * ui = { helper, draggable, position:{left,top}, offset:{left,top} } (offset is page-relative).
 * Not supported: snap, grid, connectToSortable, scope, cursor options.
 */
(function (window) {
    'use strict';
    var NQ = window.NQ;
    if (!NQ) return;

    var droppables = [];

    function liveDroppables() {
        droppables = droppables.filter(function (d) { return d.isConnected && d.nqDroppable; });
        return droppables;
    }

    function matches(accept, el) {
        if (!accept || accept === '*') return true;
        if (typeof accept === 'function') return !!accept.call(null, el);
        return el.matches(accept);
    }

    function pageOffset(r) { return { left: r.left + window.pageXOffset, top: r.top + window.pageYOffset }; }

    function wrap(o) { return new NQ(o); }

    function containmentRect(el, c) {
        if (!c) return null;
        if (c === 'window') return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        if (c === 'document') {
            var d = document.documentElement;
            return { left: -window.pageXOffset, top: -window.pageYOffset,
                     right: d.scrollWidth - window.pageXOffset, bottom: d.scrollHeight - window.pageYOffset };
        }
        var target = c === 'parent' ? el.parentNode : (c.nodeType ? c : document.querySelector(c));
        return target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    }

    function overlaps(tol, dr, tr, px, py) {
        var l = Math.max(dr.left, tr.left), r = Math.min(dr.right, tr.right);
        var t = Math.max(dr.top, tr.top), b = Math.min(dr.bottom, tr.bottom);
        if (tol === 'pointer') return px >= tr.left && px <= tr.right && py >= tr.top && py <= tr.bottom;
        if (tol === 'fit') return dr.left >= tr.left && dr.right <= tr.right && dr.top >= tr.top && dr.bottom <= tr.bottom;
        if (tol === 'touch') return r > l && b > t;
        var dw = dr.right - dr.left, dh = dr.bottom - dr.top;
        return tr.left <= dr.left + dw / 2 && dr.right - dw / 2 <= tr.right &&
               tr.top <= dr.top + dh / 2 && dr.bottom - dh / 2 <= tr.bottom;
    }

    function buildUi(s) {
        var r = s.helper.getBoundingClientRect();
        return {
            helper: wrap(s.helper), draggable: wrap(s.el),
            position: { left: parseFloat(s.helper.style.left) || 0, top: parseFloat(s.helper.style.top) || 0 },
            offset: pageOffset(r)
        };
    }

    function fire(s, name, e) {
        var ui = buildUi(s);
        var cb = s.opts[name];
        if (typeof cb === 'function') cb.call(s.el, e, ui);
        wrap(s.el).trigger('drag' + name, [ui]);
        return ui;
    }

    function setDropState(s, e, finalize) {
        var r = s.helper.getBoundingClientRect();
        var hits = [];
        liveDroppables().forEach(function (d) {
            var o = d.nqDroppable;
            if (!matches(o.accept, s.el) || d === s.el) return;
            var tr = d.getBoundingClientRect();
            var hit = overlaps(o.tolerance, r, tr, e.clientX, e.clientY);
            if (hit) hits.push(d);
            if (hit !== !!d.nqOver) {
                d.nqOver = hit;
                if (o.hoverClass) d.classList.toggle(o.hoverClass, hit);
                var cb = hit ? o.over : o.out;
                if (typeof cb === 'function') cb.call(d, e, { draggable: wrap(s.el), helper: wrap(s.helper) });
            }
        });
        if (!finalize) return hits;
        // Innermost first; a greedy droppable stops propagation to its ancestors
        hits.sort(function (a, b) { return a.contains(b) ? 1 : b.contains(a) ? -1 : 0; });
        var dropped = [];
        for (var i = 0; i < hits.length; i++) {
            var o = hits[i].nqDroppable;
            dropped.push(hits[i]);
            if (typeof o.drop === 'function') o.drop.call(hits[i], e, { draggable: wrap(s.el), helper: wrap(s.helper) });
            if (o.greedy) break;
        }
        return dropped;
    }

    function setActive(s, e, on) {
        liveDroppables().forEach(function (d) {
            var o = d.nqDroppable;
            if (!matches(o.accept, s.el) || d === s.el) return;
            if (o.activeClass) d.classList.toggle(o.activeClass, on);
            if (!on) { d.nqOver = false; if (o.hoverClass) d.classList.remove(o.hoverClass); }
            var cb = on ? o.activate : o.deactivate;
            if (typeof cb === 'function') cb.call(d, e, { draggable: wrap(s.el) });
        });
    }

    function startDrag(s, e) {
        var el = s.el, o = s.opts, rect = el.getBoundingClientRect();
        s.origRect = rect;
        var h = typeof o.helper === 'function' ? o.helper.call(el, e) : o.helper;
        if (h && h !== 'original' && (h === 'clone' || h.nodeType || h.jquery || h.length)) {
            var helper = h === 'clone' ? el.cloneNode(true) : (h.nodeType ? h : h[0]);
            helper.removeAttribute('id');
            helper.style.position = 'fixed';
            helper.style.margin = '0';
            helper.style.left = rect.left + 'px';
            helper.style.top = rect.top + 'px';
            if (h === 'clone') { helper.style.width = rect.width + 'px'; helper.style.height = rect.height + 'px'; }
            var host = o.appendTo === 'parent' ? el.parentNode : (typeof o.appendTo === 'string' && o.appendTo !== 'body' ? document.querySelector(o.appendTo) : document.body);
            (host || document.body).appendChild(helper);
            s.helper = helper; s.cloned = true;
            s.startLeft = rect.left; s.startTop = rect.top;
        } else {
            var cs = getComputedStyle(el);
            if (cs.position === 'static') el.style.position = 'relative';
            s.helper = el; s.cloned = false;
            s.origStyle = { left: el.style.left, top: el.style.top, position: el.style.position };
            s.startLeft = parseFloat(cs.left) || 0; s.startTop = parseFloat(cs.top) || 0;
        }
        s.prevZ = s.helper.style.zIndex;
        if (o.zIndex != null && o.zIndex !== '') s.helper.style.zIndex = o.zIndex;
        s.helper.classList.add('ui-draggable-dragging');
        s.cRect = containmentRect(el, o.containment);
        s.dragging = true;
        setActive(s, e, true);
        fire(s, 'start', e);
    }

    function moveDrag(s, e) {
        var dx = e.clientX - s.x0, dy = e.clientY - s.y0, o = s.opts;
        if (o.axis === 'x') dy = 0;
        if (o.axis === 'y') dx = 0;
        var r0 = s.origRect;
        if (s.cRect) {
            dx = Math.min(Math.max(dx, s.cRect.left - r0.left), s.cRect.right - r0.right);
            dy = Math.min(Math.max(dy, s.cRect.top - r0.top), s.cRect.bottom - r0.bottom);
        }
        s.helper.style.left = (s.startLeft + dx) + 'px';
        s.helper.style.top = (s.startTop + dy) + 'px';
        setDropState(s, e, false);
        fire(s, 'drag', e);
    }

    function revertBack(s, done) {
        var h = s.helper;
        h.style.transition = 'left 200ms, top 200ms';
        h.style.left = s.startLeft + 'px';
        h.style.top = s.startTop + 'px';
        var fin = function () { h.style.transition = ''; done(); };
        h.addEventListener('transitionend', fin, { once: true });
        setTimeout(fin, 260);
    }

    function endDrag(s, e) {
        var dropped = setDropState(s, e, true);
        var revert = s.opts.revert;
        var doRevert = revert === true || (revert === 'valid' && dropped.length > 0) || (revert === 'invalid' && !dropped.length) ||
            (typeof revert === 'function' && revert.call(s.el, dropped.length ? wrap(dropped[0]) : false));
        var ui = fire(s, 'stop', e);
        setActive(s, e, false);
        var cleanup = function () {
            s.helper.classList.remove('ui-draggable-dragging');
            if (s.cloned) s.helper.remove();
            else s.helper.style.zIndex = s.prevZ;
        };
        if (doRevert) revertBack(s, cleanup); else cleanup();
        return ui;
    }

    function attach(el, opts) {
        var s = { el: el, opts: opts };
        el.nqDraggable = s;
        el.classList.add('ui-draggable');
        el.style.touchAction = 'none';
        s.onDown = function (e) {
            if (e.button > 0 || s.disabled) return;
            var cancel = opts.cancel === undefined ? 'input,textarea,button,select,option' : opts.cancel;
            if (cancel && e.target.closest && e.target.closest(cancel) && e.target !== el) return;
            if (opts.handle && !(e.target.closest && e.target.closest(opts.handle) && el.contains(e.target.closest(opts.handle)))) return;
            s.x0 = e.clientX; s.y0 = e.clientY; s.dragging = false; s.pid = e.pointerId;
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer may already be released */ }
            el.addEventListener('pointermove', s.onMove);
            el.addEventListener('pointerup', s.onUp);
            el.addEventListener('pointercancel', s.onUp);
            e.preventDefault();
        };
        s.onMove = function (e) {
            if (e.pointerId !== s.pid) return;
            if (!s.dragging) {
                var dist = opts.distance == null ? 1 : opts.distance;
                if (Math.max(Math.abs(e.clientX - s.x0), Math.abs(e.clientY - s.y0)) < dist) return;
                startDrag(s, e);
            }
            moveDrag(s, e);
        };
        s.onUp = function (e) {
            if (e.pointerId !== s.pid) return;
            el.removeEventListener('pointermove', s.onMove);
            el.removeEventListener('pointerup', s.onUp);
            el.removeEventListener('pointercancel', s.onUp);
            try { el.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
            if (s.dragging) {
                s.dragging = false;
                // a drag must not also trigger a click on the dragged element
                var swallow = function (ev) { ev.stopImmediatePropagation(); ev.preventDefault(); };
                el.addEventListener('click', swallow, true);
                setTimeout(function () { el.removeEventListener('click', swallow, true); }, 50);
                endDrag(s, e);
            }
        };
        el.addEventListener('pointerdown', s.onDown);
    }

    function detach(el) {
        var s = el.nqDraggable;
        if (!s) return;
        el.removeEventListener('pointerdown', s.onDown);
        el.classList.remove('ui-draggable', 'ui-draggable-dragging');
        el.style.touchAction = '';
        delete el.nqDraggable;
    }

    NQ.fn.draggable = function (arg, name, value) {
        return this.each(function () {
            var el = this;
            if (typeof arg === 'string') {
                if (arg === 'destroy') detach(el);
                else if (arg === 'disable' && el.nqDraggable) el.nqDraggable.disabled = true;
                else if (arg === 'enable' && el.nqDraggable) el.nqDraggable.disabled = false;
                else if (arg === 'option' && el.nqDraggable && value !== undefined) el.nqDraggable.opts[name] = value;
                return;
            }
            detach(el);
            attach(el, arg || {});
        });
    };

    NQ.fn.droppable = function (arg, name, value) {
        if (arg === 'option' && value === undefined && typeof name === 'string') {
            var d0 = this[0] && this[0].nqDroppable;
            return d0 ? d0[name] : undefined;
        }
        return this.each(function () {
            var el = this;
            if (typeof arg === 'string') {
                if (arg === 'destroy') { delete el.nqDroppable; el.classList.remove('ui-droppable'); }
                else if (arg === 'option' && el.nqDroppable) {
                    var o = {};
                    if (typeof name === 'object') o = name; else o[name] = value;
                    Object.keys(o).forEach(function (k) { el.nqDroppable[k] = o[k]; });
                }
                return;
            }
            var opts = arg || {};
            el.nqDroppable = {
                accept: opts.accept === undefined ? '*' : opts.accept,
                activeClass: opts.activeClass, hoverClass: opts.hoverClass,
                tolerance: opts.tolerance || 'intersect', greedy: !!opts.greedy,
                drop: opts.drop, over: opts.over, out: opts.out, activate: opts.activate, deactivate: opts.deactivate
            };
            el.classList.add('ui-droppable');
            if (droppables.indexOf(el) < 0) droppables.push(el);
        });
    };
})(window);

/*
 * NQ.fn.sortable: reorder the children of a container by dragging (Pointer Events).
 * Options: items (selector, default all element children), handle, axis ('x'|'y'), distance,
 *   start/update/stop callbacks (event, ui). 'refresh' is a no-op; 'destroy' removes the behaviour.
 * Triggers 'sortstart', 'sortupdate', 'sortstop' with (event, ui = {item}).
 */
(function (window) {
    'use strict';
    var NQ = window.NQ;
    if (!NQ) return;

    function items(box, o) {
        var all = Array.prototype.filter.call(box.children, function (c) { return !o.items || c.matches(o.items.replace(/^>\s*/, '')); });
        return all;
    }

    function attach(box, o) {
        var s = { box: box, o: o };
        box.nqSortable = s;
        s.onDown = function (e) {
            if (e.button > 0) return;
            var item = e.target.closest && e.target.closest(o.items ? o.items.replace(/^>\s*/, '') : '*');
            while (item && item.parentNode !== box) item = item.parentNode && item.parentNode.closest ? item.parentNode.closest(o.items ? o.items.replace(/^>\s*/, '') : '*') : null;
            if (!item || (o.handle && !e.target.closest(o.handle))) return;
            if (e.target.closest('input,textarea,select,option') ) return;
            s.item = item; s.x0 = e.clientX; s.y0 = e.clientY; s.pid = e.pointerId; s.moving = false;
            s.before = items(box, o).indexOf(item);
            try { box.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            box.addEventListener('pointermove', s.onMove);
            box.addEventListener('pointerup', s.onUp);
            box.addEventListener('pointercancel', s.onUp);
        };
        s.onMove = function (e) {
            if (e.pointerId !== s.pid) return;
            var item = s.item;
            if (!s.moving) {
                if (Math.max(Math.abs(e.clientX - s.x0), Math.abs(e.clientY - s.y0)) < (o.distance == null ? 3 : o.distance)) return;
                s.moving = true;
                var r = item.getBoundingClientRect();
                s.grabX = s.x0 - r.left; s.grabY = s.y0 - r.top;
                item.classList.add('ui-sortable-helper');
                item.style.position = 'relative';
                item.style.zIndex = 1000;
                if (typeof o.start === 'function') o.start.call(box, e, { item: new NQ(item) });
                new NQ(box).trigger('sortstart', [{ item: new NQ(item) }]);
            }
            item.style.transform = '';
            var rect = item.getBoundingClientRect();
            var others = items(box, o).filter(function (c) { return c !== item; });
            for (var i = 0; i < others.length; i++) {
                var rr = others[i].getBoundingClientRect();
                var inside = e.clientX >= rr.left && e.clientX <= rr.right && e.clientY >= rr.top && e.clientY <= rr.bottom;
                if (!inside) continue;
                var after = o.axis === 'y' ? e.clientY > rr.top + rr.height / 2 :
                            o.axis === 'x' ? e.clientX > rr.left + rr.width / 2 :
                            (Math.abs(rr.left + rr.width / 2 - rect.left - rect.width / 2) > Math.abs(rr.top + rr.height / 2 - rect.top - rect.height / 2) ?
                                e.clientX > rr.left + rr.width / 2 : e.clientY > rr.top + rr.height / 2);
                var pos = item.compareDocumentPosition(others[i]) & Node.DOCUMENT_POSITION_FOLLOWING;
                if (pos && after) box.insertBefore(item, others[i].nextSibling);
                else if (!pos && !after) box.insertBefore(item, others[i]);
                rect = item.getBoundingClientRect();
                break;
            }
            var dx = o.axis === 'y' ? 0 : e.clientX - s.grabX - rect.left;
            var dy = o.axis === 'x' ? 0 : e.clientY - s.grabY - rect.top;
            item.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        };
        s.onUp = function (e) {
            if (e.pointerId !== s.pid) return;
            box.removeEventListener('pointermove', s.onMove);
            box.removeEventListener('pointerup', s.onUp);
            box.removeEventListener('pointercancel', s.onUp);
            try { box.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            if (!s.moving) return;
            var item = s.item;
            s.moving = false;
            item.style.transform = ''; item.style.position = ''; item.style.zIndex = '';
            item.classList.remove('ui-sortable-helper');
            var swallow = function (ev) { ev.stopImmediatePropagation(); ev.preventDefault(); };
            item.addEventListener('click', swallow, true);
            setTimeout(function () { item.removeEventListener('click', swallow, true); }, 50);
            var ui = { item: new NQ(item) };
            if (items(box, o).indexOf(item) !== s.before) {
                if (typeof o.update === 'function') o.update.call(box, e, ui);
                new NQ(box).trigger('sortupdate', [ui]);
            }
            if (typeof o.stop === 'function') o.stop.call(box, e, ui);
            new NQ(box).trigger('sortstop', [ui]);
        };
        box.addEventListener('pointerdown', s.onDown);
        box.classList.add('ui-sortable');
        box.style.touchAction = o.axis === 'x' ? 'pan-y' : 'none';
    }

    NQ.fn.sortable = function (arg) {
        return this.each(function () {
            var box = this;
            if (typeof arg === 'string') {
                if (arg === 'destroy' && box.nqSortable) {
                    box.removeEventListener('pointerdown', box.nqSortable.onDown);
                    box.classList.remove('ui-sortable');
                    delete box.nqSortable;
                }
                return;
            }
            if (box.nqSortable) box.removeEventListener('pointerdown', box.nqSortable.onDown);
            attach(box, arg || {});
        });
    };
})(window);
