/*
 * NQ.fn.dialog: a subset of the jQuery UI dialog API on top of a Bootstrap 5 modal.
 * Requires nq.js and the Bootstrap 5 JS bundle.
 *
 * Supported: options { autoOpen, title, width, height, modal, buttons, close, open },
 * and the commands 'open', 'close', 'destroy', 'isOpen', 'option'.
 * Ignored (the dialog is always centered): position, show, hide, resizable, draggable.
 */
(function (window) {
    'use strict';
    var NQ = window.NQ;
    if (!NQ) return;

    function build(el, opts) {
        var wrap = document.createElement('div');
        wrap.className = 'modal fade nq-dialog';
        wrap.tabIndex = -1;
        wrap.innerHTML =
            '<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">' +
            '<div class="modal-header"><h5 class="modal-title"></h5>' +
            '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
            '<div class="modal-body"></div><div class="modal-footer"></div></div></div>';
        var dialog = wrap.querySelector('.modal-dialog');
        // jQuery UI class names, so existing page CSS keeps applying
        wrap.querySelector('.modal-content').classList.add('ui-dialog', 'ui-widget', 'ui-widget-content');
        wrap.querySelector('.modal-header').classList.add('ui-dialog-titlebar', 'ui-widget-header');
        wrap.querySelector('.btn-close').classList.add('ui-dialog-titlebar-close');
        wrap.querySelector('.modal-footer').classList.add('ui-dialog-buttonpane');
        wrap.querySelector('.modal-body').classList.add('ui-dialog-content');
        wrap.style.zIndex = opts.zIndex || 1700;
        if (opts.width && opts.width !== 'auto') {
            var w = typeof opts.width === 'number' ? opts.width + 'px' : opts.width;
            dialog.style.maxWidth = w;
            dialog.style.width = w;
        }
        if (typeof opts.height === 'number') wrap.querySelector('.modal-content').style.height = opts.height + 'px';

        var state = {
            el: el, wrap: wrap, opts: opts,
            parent: el.parentNode, next: el.nextSibling,
            display: el.style.display, open: false
        };
        state.footer = wrap.querySelector('.modal-footer');
        el.style.display = '';
        wrap.querySelector('.modal-body').appendChild(el);
        document.body.appendChild(wrap);
        setTitle(state, opts.title !== undefined ? opts.title : el.getAttribute('title'));
        setButtons(state, opts.buttons);

        wrap.addEventListener('show.bs.modal', function () {
            state.open = true;
            if (opts.modal !== false && !state.backdrop) {
                state.backdrop = document.createElement('div');
                state.backdrop.className = 'modal-backdrop fade show nq-dialog-backdrop';
                state.backdrop.style.zIndex = (parseInt(wrap.style.zIndex, 10) || 1700) - 1;
                document.body.appendChild(state.backdrop);
            }
        });
        wrap.addEventListener('hide.bs.modal', function () {
            state.open = false;
            if (state.backdrop) { state.backdrop.remove(); state.backdrop = null; }
        });
        wrap.addEventListener('shown.bs.modal', function (e) {
            if (typeof opts.open === 'function') opts.open.call(el, e, {});
        });
        wrap.addEventListener('hidden.bs.modal', function (e) {
            if (typeof opts.close === 'function') opts.close.call(el, e, {});
        });
        state.modal = bootstrap.Modal.getOrCreateInstance(wrap, {
            backdrop: false,
            keyboard: true
        });
        el.nqDialog = state;
        return state;
    }

    function setTitle(state, title) {
        var h = state.wrap.querySelector('.modal-title');
        h.textContent = title || '';
        state.wrap.querySelector('.modal-header').style.display = title ? '' : 'none';
    }

    function setButtons(state, buttons) {
        state.footer.innerHTML = '';
        var list = [];
        if (Array.isArray(buttons)) list = buttons;
        else if (buttons && typeof buttons === 'object') {
            Object.keys(buttons).forEach(function (k) { list.push({ text: k, click: buttons[k] }); });
        }
        state.footer.style.display = list.length ? '' : 'none';
        list.forEach(function (b) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = b['class'] || b.className || 'btn btn-secondary';
            btn.textContent = b.text || b.label || '';
            if (b.id) btn.id = b.id;
            btn.addEventListener('click', function (e) {
                if (typeof b.click === 'function') b.click.call(state.el, e);
            });
            state.footer.appendChild(btn);
        });
    }

    function destroy(el) {
        var s = el.nqDialog;
        if (!s) return;
        s.modal.dispose();
        if (s.backdrop) s.backdrop.remove();
        el.style.display = s.display || 'none';
        if (s.parent && s.parent.isConnected) s.parent.insertBefore(el, s.next && s.next.parentNode === s.parent ? s.next : null);
        else el.remove();
        s.wrap.remove();
        document.querySelectorAll('.nq-dialog-backdrop').forEach(function (b) {
            if (!document.querySelector('.modal.show')) b.remove();
        });
        delete el.nqDialog;
    }

    NQ.fn.dialog = function (arg, name, value) {
        if (arg === 'isOpen') return !!(this[0] && this[0].nqDialog && this[0].nqDialog.open);
        if (arg === 'option' && value === undefined && typeof name === 'string') {
            var s0 = this[0] && this[0].nqDialog;
            return s0 ? (name === 'title' ? s0.wrap.querySelector('.modal-title').textContent : s0.opts[name]) : undefined;
        }
        return this.each(function () {
            var el = this, s = el.nqDialog;
            if (typeof arg === 'string') {
                if (arg === 'destroy') return destroy(el);
                if (!s) return;
                if (arg === 'open') s.modal.show();
                else if (arg === 'close') s.modal.hide();
                else if (arg === 'option') {
                    var o = {};
                    if (typeof name === 'object') o = name; else o[name] = value;
                    Object.keys(o).forEach(function (k) {
                        s.opts[k] = o[k];
                        if (k === 'title') setTitle(s, o[k]);
                        if (k === 'buttons') setButtons(s, o[k]);
                    });
                }
                return;
            }
            var opts = arg || {};
            if (s) destroy(el);
            s = build(el, opts);
            if (opts.autoOpen !== false) s.modal.show();
        });
    };
})(window);
