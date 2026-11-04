/*
 * NQ - a small DOM helper that provides the subset of the jQuery API that
 * nitrogen.js and the Nitrogen-generated javascript (actions, validators,
 * wf:wire("$('#x').addClass('y')") style snippets) rely on.
 *
 * It exists so Nitrogen doesn't require jQuery. If jQuery (and plugins such as
 * jQuery UI) are loaded on the page, any method NQ doesn't implement (for
 * example .draggable() or .datepicker()) is forwarded to jQuery.
 *
 * If no global $ exists, NQ is also installed as $.
 */
(function(global) {
    "use strict";

    var dataStore = new WeakMap();
    var handlerStore = new WeakMap();
    var UNITLESS = /^(opacity|zIndex|fontWeight|lineHeight|flex|flexGrow|flexShrink|order|zoom)$/;
    var SPEEDS = { fast: 200, slow: 600, _default: 400 };

    function isString(v) { return typeof v === "string"; }
    function isNode(v) { return v && (v.nodeType === 1 || v.nodeType === 9 || v.nodeType === 11); }

    function expandSelector(sel) {
        var filter = null;
        sel = sel.replace(/:input\b/g, "input,select,textarea,button");
        var m = sel.match(/:(visible|hidden)\s*$/);
        if (m) {
            filter = m[1];
            sel = sel.replace(/:(visible|hidden)\s*$/, "");
        }
        return { selector: sel.trim() || "*", filter: filter };
    }

    function isVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
    }

    function uniq(list) {
        var seen = new Set(), out = [];
        list.forEach(function(el) {
            if (!seen.has(el)) { seen.add(el); out.push(el); }
        });
        return out;
    }

    function docOrder(list) {
        if (list.length < 2) return list;
        return list.slice().sort(function(a, b) {
            if (a === b || !a.compareDocumentPosition) return 0;
            return (a.compareDocumentPosition(b) & 4) ? -1 : 1;
        });
    }

    function parseHtml(html, ctx) {
        var range = document.createRange();
        range.selectNodeContents(ctx && ctx.nodeType === 1 ? ctx : document.body || document.documentElement);
        // createContextualFragment keeps scripts executable once inserted
        return range.createContextualFragment(html);
    }

    function NQ(sel, ctx) {
        if (!(this instanceof NQ)) return new NQ(sel, ctx);
        var els = [];
        if (sel == null || sel === false) {
            els = [];
        } else if (sel instanceof NQ) {
            els = sel.toArray();
        } else if (isString(sel)) {
            sel = sel.trim();
            if (sel.charAt(0) === "<") {
                els = Array.prototype.slice.call(parseHtml(sel).childNodes);
            } else {
                var e = expandSelector(sel);
                var root = ctx ? new NQ(ctx).toArray() : [document];
                root.forEach(function(r) {
                    els = els.concat(Array.prototype.slice.call(r.querySelectorAll(e.selector)));
                });
                if (e.filter) els = els.filter(function(x) { return isVisible(x) === (e.filter === "visible"); });
            }
        } else if (typeof sel === "function") {
            NQ.ready(sel);
        } else if (isNode(sel) || sel === global) {
            els = [sel];
        } else if (sel.jquery && typeof sel.toArray === "function") {
            els = sel.toArray();
        } else if (typeof sel.length === "number") {
            Array.prototype.slice.call(sel).forEach(function(x) {
                els = els.concat(x instanceof NQ ? x.toArray() : [x]);
            });
        }
        els = uniq(els);
        for (var i = 0; i < els.length; i++) this[i] = els[i];
        this.length = els.length;
    }

    NQ.fn = NQ.prototype;
    NQ.prototype.jquery = "nq";

    // Methods NQ doesn't know are forwarded to jQuery (plugins) when it's present.
    var jq = function() { return global.jQuery && global.jQuery !== NQ ? global.jQuery : null; };
    Object.setPrototypeOf(NQ.prototype, new Proxy({}, {
        get: function(target, name) {
            var J = jq();
            if (typeof name === "string" && J && typeof J.fn[name] === "function") {
                return function() {
                    var res = J.fn[name].apply(J(this.toArray()), arguments);
                    return (res && res.jquery) ? new NQ(res.toArray()) : res;
                };
            }
            return undefined;
        }
    }));

    /*** static helpers ***/
    NQ.Event = function(type, props) {
        var e = new Event(type, {bubbles: true, cancelable: true});
        return props ? NQ.extend(e, props) : e;
    };
    NQ.trim = function(s) { return s == null ? "" : String(s).trim(); };
    NQ.inArray = function(v, arr) { return Array.prototype.indexOf.call(arr, v); };
    NQ.isArray = Array.isArray;
    NQ.isFunction = function(f) { return typeof f === "function"; };
    NQ.each = function(obj, fn) {
        if (obj && typeof obj.length === "number") {
            for (var i = 0; i < obj.length; i++) { if (fn.call(obj[i], i, obj[i]) === false) break; }
        } else {
            for (var k in obj) { if (fn.call(obj[k], k, obj[k]) === false) break; }
        }
        return obj;
    };
    NQ.extend = function(target) {
        target = target || {};
        for (var i = 1; i < arguments.length; i++) {
            var src = arguments[i];
            if (src == null) continue;
            for (var k in src) { if (src[k] !== undefined) target[k] = src[k]; }
        }
        return target;
    };
    NQ.globalEval = function(code) { (0, eval)(code); };
    NQ.ready = function(fn) {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function() { fn.call(document, NQ); });
        else setTimeout(function() { fn.call(document, NQ); }, 0);
    };
    NQ.param = function(obj) {
        var parts = [];
        function enc(s) { return encodeURIComponent(s).replace(/%20/g, "+"); }
        function add(k, v) {
            if (Array.isArray(v)) v.forEach(function(x) { add(k + "[]", x); });
            else parts.push(enc(k) + "=" + enc(v == null ? "" : typeof v === "function" ? v() : v));
        }
        for (var k in obj) add(k, obj[k]);
        return parts.join("&");
    };

    NQ.ajax = function(opts) {
        var s = NQ.extend({ type: "GET", dataType: "text", cache: true, timeout: 0 }, opts);
        var method = String(s.type || s.method).toUpperCase();
        var url = s.url;
        var body = null;
        var data = s.data && typeof s.data !== "string" ? NQ.param(s.data) : s.data;
        if (method === "GET" || method === "HEAD") {
            if (data) url += (url.indexOf("?") < 0 ? "?" : "&") + data;
            if (s.cache === false) url += (url.indexOf("?") < 0 ? "?" : "&") + "_=" + Date.now();
        } else {
            body = data;
        }
        var xhr = new XMLHttpRequest();
        var done = false;
        var handle = {
            abort: function() { if (!done) { done = true; xhr.abort(); } },
            readyState: 0
        };
        xhr.open(method, url, true);
        if (body != null) xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        if (s.timeout) xhr.timeout = s.timeout;
        function fail(status) {
            if (done) return;
            done = true;
            if (s.error) s.error(xhr, status, xhr.statusText || "");
        }
        xhr.onload = function() {
            if (done) return;
            if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 304) {
                done = true;
                var res = xhr.responseText;
                try {
                    if (s.dataType === "script") NQ.globalEval(res);
                    else if (s.dataType === "json") res = JSON.parse(res);
                } catch (e) {
                    done = false;
                    return fail("parsererror");
                }
                if (s.success) s.success(res, "success", xhr);
            } else {
                fail("error");
            }
        };
        xhr.onerror = function() { fail("error"); };
        xhr.ontimeout = function() { fail("timeout"); };
        xhr.onabort = function() { if (!done) { done = true; } };
        xhr.send(body);
        return handle;
    };

    NQ.get = function(url, success) {
        var okFns = success ? [success] : [], failFns = [];
        NQ.ajax({
            url: url,
            success: function(d) { okFns.forEach(function(f) { f(d); }); },
            error: function(x, st, err) { failFns.forEach(function(f) { f(x, st, err); }); }
        });
        var p = {
            done: function(f) { okFns.push(f); return p; },
            fail: function(f) { failFns.push(f); return p; }
        };
        return p;
    };

    /*** traversal ***/
    var P = NQ.prototype;

    P.ready = function(fn) { NQ.ready(fn); return this; };
    P.toArray = function() { return Array.prototype.slice.call(this); };
    P.get = function(i) {
        if (i === undefined) return this.toArray();
        return this[i < 0 ? this.length + i : i];
    };
    P.eq = function(i) { var e = this.get(i); return new NQ(e ? [e] : []); };
    P.first = function() { return this.eq(0); };
    P.last = function() { return this.eq(-1); };
    P.each = function(fn) {
        for (var i = 0; i < this.length; i++) {
            if (fn.call(this[i], i, this[i]) === false) break;
        }
        return this;
    };
    P.map = function(fn) {
        var out = [];
        this.each(function(i, el) { var r = fn.call(el, i, el); if (r != null) out.push(r); });
        return new NQ(out);
    };
    P.find = function(sel) {
        if (!isString(sel)) {
            var cand = new NQ(sel).toArray();
            return new NQ(cand.filter(function(c) {
                return P.toArray.call(this).some(function(r) { return r !== c && r.contains(c); });
            }, this));
        }
        var e = expandSelector(sel), out = [];
        this.each(function(i, el) {
            if (el.querySelectorAll) out = out.concat(Array.prototype.slice.call(el.querySelectorAll(e.selector)));
        });
        if (e.filter) out = out.filter(function(x) { return isVisible(x) === (e.filter === "visible"); });
        return new NQ(out);
    };
    function matches(el, sel) {
        if (typeof sel === "function") return !!sel.call(el);
        if (sel instanceof NQ) return sel.toArray().indexOf(el) >= 0;
        if (isNode(sel)) return el === sel;
        var e = expandSelector(sel);
        if (!el.matches) return false;
        var ok = el.matches(e.selector);
        if (ok && e.filter) ok = isVisible(el) === (e.filter === "visible");
        return ok;
    }
    P.is = function(sel) {
        for (var i = 0; i < this.length; i++) if (matches(this[i], sel)) return true;
        return false;
    };
    P.filter = function(sel) { return new NQ(this.toArray().filter(function(el, i) {
        return typeof sel === "function" ? sel.call(el, i, el) : matches(el, sel); })); };
    P.not = function(sel) { return new NQ(this.toArray().filter(function(el, i) {
        return typeof sel === "function" ? !sel.call(el, i, el) : !matches(el, sel); })); };
    P.add = function(sel, ctx) {
        return new NQ(docOrder(uniq(this.toArray().concat(new NQ(sel, ctx).toArray()))));
    };
    P.children = function(sel) {
        var out = [];
        this.each(function(i, el) { out = out.concat(Array.prototype.slice.call(el.children || [])); });
        var r = new NQ(out);
        return sel ? r.filter(sel) : r;
    };
    P.parent = function() {
        return new NQ(this.toArray().map(function(el) { return el.parentNode; })
            .filter(function(p) { return p && p.nodeType === 1; }));
    };
    P.parentsUntil = function(stop) {
        var out = [];
        var stopEls = stop == null ? [] : (isString(stop) ? null : new NQ(stop).toArray());
        this.each(function(i, el) {
            var p = el.parentNode;
            while (p && p.nodeType === 1) {
                if (stopEls ? stopEls.indexOf(p) >= 0 : p.matches(expandSelector(stop).selector)) break;
                out.push(p);
                p = p.parentNode;
            }
        });
        return new NQ(uniq(out));
    };
    P.closest = function(sel) {
        return new NQ(uniq(this.toArray().map(function(el) {
            return el.closest ? el.closest(expandSelector(sel).selector) : null;
        }).filter(Boolean)));
    };
    P.next = function(sel) {
        return new NQ(this.toArray().map(function(el) { return el.nextElementSibling; })
            .filter(function(n) { return n && (!sel || matches(n, sel)); }));
    };

    /*** data, attributes, properties ***/
    P.data = function(key, val) {
        if (arguments.length >= 2) {
            return this.each(function() {
                var d = dataStore.get(this);
                if (!d) { d = {}; dataStore.set(this, d); }
                d[key] = val;
            });
        }
        var el = this[0];
        if (!el) return undefined;
        var d = dataStore.get(el);
        if (d && key in d) return d[key];
        if (el.dataset && key in el.dataset) return el.dataset[key];
        return undefined;
    };
    P.removeData = function(key) {
        return this.each(function() { var d = dataStore.get(this); if (d) delete d[key]; });
    };
    P.attr = function(k, v) {
        if (v === undefined && !(k && typeof k === "object")) {
            var el = this[0];
            return el && el.getAttribute ? (el.getAttribute(k) === null ? undefined : el.getAttribute(k)) : undefined;
        }
        return this.each(function() {
            var self = this;
            if (k && typeof k === "object") for (var n in k) self.setAttribute(n, k[n]);
            else if (v === null) self.removeAttribute(k);
            else self.setAttribute(k, v);
        });
    };
    P.removeAttr = function(k) { return this.each(function() { this.removeAttribute(k); }); };
    P.prop = function(k, v) {
        if (v === undefined && !(k && typeof k === "object")) return this[0] ? this[0][k] : undefined;
        return this.each(function() {
            if (k && typeof k === "object") for (var n in k) this[n] = k[n];
            else this[k] = v;
        });
    };
    P.val = function(v) {
        if (arguments.length === 0) {
            var el = this[0];
            if (!el) return undefined;
            if (el.type === "select-multiple") {
                return Array.prototype.filter.call(el.options, function(o) { return o.selected && !o.disabled; })
                    .map(function(o) { return o.value; });
            }
            if (el.type === "select-one") {
                var o = el.options[el.selectedIndex];
                return o && !o.disabled ? o.value : null;
            }
            var r = el.value;
            return typeof r === "string" ? r.replace(/\r/g, "") : (r == null ? "" : r);
        }
        return this.each(function() {
            var el = this;
            if (el.type === "select-multiple") {
                var vals = [].concat(v).map(String);
                Array.prototype.forEach.call(el.options, function(o) { o.selected = vals.indexOf(o.value) >= 0; });
            } else if (Array.isArray(v) && (el.type === "checkbox" || el.type === "radio")) {
                el.checked = v.map(String).indexOf(el.value) >= 0;
            } else if (el.type === "select-one") {
                el.value = v == null ? "" : String(v);
                if (el.selectedIndex < 0 && v == null) el.selectedIndex = -1;
            } else {
                el.value = v == null ? "" : String(v);
            }
        });
    };
    P.html = function(v) {
        if (v === undefined) return this[0] ? this[0].innerHTML : undefined;
        return this.each(function() {
            this.replaceChildren();
            this.appendChild(parseHtml(String(v), this));
        });
    };
    P.text = function(v) {
        if (v === undefined) return this.toArray().map(function(e) { return e.textContent; }).join("");
        return this.each(function() { this.textContent = v; });
    };
    P.empty = function() { return this.each(function() { this.replaceChildren(); }); };

    /*** classes and css ***/
    function classes(c) { return String(c).split(/\s+/).filter(Boolean); }
    P.addClass = function(c) { var cs = classes(c); return this.each(function() { var el = this; cs.forEach(function(x) { el.classList.add(x); }); }); };
    P.removeClass = function(c) { var cs = classes(c); return this.each(function() { var el = this; cs.forEach(function(x) { el.classList.remove(x); }); }); };
    P.toggleClass = function(c, state) {
        var cs = classes(c);
        return this.each(function() {
            var el = this;
            cs.forEach(function(x) { state === undefined ? el.classList.toggle(x) : el.classList.toggle(x, !!state); });
        });
    };
    P.hasClass = function(c) {
        for (var i = 0; i < this.length; i++) if (this[i].classList && this[i].classList.contains(c)) return true;
        return false;
    };
    function cssName(k) { return k.indexOf("--") === 0 ? k : k.replace(/-([a-z])/g, function(m, c) { return c.toUpperCase(); }); }
    P.css = function(k, v) {
        if (k && typeof k === "object") {
            for (var n in k) this.css(n, k[n]);
            return this;
        }
        var name = cssName(k);
        if (v === undefined) {
            return this[0] ? getComputedStyle(this[0])[name] || this[0].style[name] : undefined;
        }
        return this.each(function() {
            var val = typeof v === "number" && !UNITLESS.test(name) ? v + "px" : v;
            if (name.indexOf("--") === 0) this.style.setProperty(name, val); else this.style[name] = val;
        });
    };

    /*** dimensions ***/
    function px(v) { return parseFloat(v) || 0; }
    function dim(self, which, outer, margin, v) {
        var el = self[0];
        if (v !== undefined) {
            return self.each(function() { this.style[which] = typeof v === "number" ? v + "px" : v; });
        }
        if (!el) return undefined;
        if (el === global) return document.documentElement["client" + (which === "width" ? "Width" : "Height")];
        if (el.nodeType === 9) return el.documentElement["scroll" + (which === "width" ? "Width" : "Height")];
        var cs = getComputedStyle(el), rect = el.getBoundingClientRect();
        var size = rect[which];
        var w = which === "width";
        if (!outer) {
            size -= px(w ? cs.paddingLeft : cs.paddingTop) + px(w ? cs.paddingRight : cs.paddingBottom)
                + px(w ? cs.borderLeftWidth : cs.borderTopWidth) + px(w ? cs.borderRightWidth : cs.borderBottomWidth);
        } else if (margin) {
            size += px(w ? cs.marginLeft : cs.marginTop) + px(w ? cs.marginRight : cs.marginBottom);
        }
        return size;
    }
    P.width = function(v) { return dim(this, "width", false, false, v); };
    P.height = function(v) { return dim(this, "height", false, false, v); };
    P.outerWidth = function(m) { return dim(this, "width", true, m === true); };
    P.outerHeight = function(m) { return dim(this, "height", true, m === true); };
    P.offset = function(coords) {
        if (coords) {
            return this.each(function() {
                var cur = new NQ(this).offset();
                var cs = getComputedStyle(this);
                if (cs.position === "static") this.style.position = "relative";
                var now = new NQ(this).offset();
                this.style.top = (px(cs.top) + coords.top - now.top) + "px";
                this.style.left = (px(cs.left) + coords.left - now.left) + "px";
            });
        }
        var el = this[0];
        if (!el || !el.getBoundingClientRect) return undefined;
        var r = el.getBoundingClientRect();
        return { top: r.top + global.pageYOffset, left: r.left + global.pageXOffset };
    };
    function scrollProp(self, prop, v) {
        var map = { scrollTop: "pageYOffset", scrollLeft: "pageXOffset" };
        if (v === undefined) {
            var el = self[0];
            if (!el) return undefined;
            return (el === global || el.nodeType === 9) ? global[map[prop]] : el[prop];
        }
        return self.each(function() {
            if (this === global || this.nodeType === 9) {
                global.scrollTo(prop === "scrollLeft" ? v : global.pageXOffset, prop === "scrollTop" ? v : global.pageYOffset);
            } else this[prop] = v;
        });
    }
    P.scrollTop = function(v) { return scrollProp(this, "scrollTop", v); };
    P.scrollLeft = function(v) { return scrollProp(this, "scrollLeft", v); };

    /*** DOM manipulation ***/
    function insert(self, content, where) {
        var targets = self.toArray();
        targets.forEach(function(el, idx) {
            var ctx = (where === "append" || where === "prepend") ? el : el.parentNode;
            if (!ctx) return;
            var frag;
            if (isString(content)) {
                frag = parseHtml(content, ctx);
            } else {
                frag = document.createDocumentFragment();
                new NQ(content).each(function() { frag.appendChild(idx < targets.length - 1 ? this.cloneNode(true) : this); });
            }
            if (where === "append") el.appendChild(frag);
            else if (where === "prepend") el.insertBefore(frag, el.firstChild);
            else if (where === "before") ctx.insertBefore(frag, el);
            else if (where === "after") ctx.insertBefore(frag, el.nextSibling);
            else if (where === "replace") { ctx.replaceChild(frag, el); }
        });
        return self;
    }
    P.append = function() { var self = this; Array.prototype.forEach.call(arguments, function(c) { insert(self, c, "append"); }); return this; };
    P.prepend = function() { var self = this; Array.prototype.forEach.call(arguments, function(c) { insert(self, c, "prepend"); }); return this; };
    P.before = function() { var self = this; Array.prototype.forEach.call(arguments, function(c) { insert(self, c, "before"); }); return this; };
    P.after = function() { var self = this; Array.prototype.forEach.call(arguments, function(c) { insert(self, c, "after"); }); return this; };
    P.replaceWith = function(c) { return insert(this, c, "replace"); };
    P.appendTo = function(t) { new NQ(t).append(this); return this; };
    P.insertAfter = function(t) { new NQ(t).after(this); return this; };
    P.prependTo = function(t) { new NQ(t).prepend(this); return this; };
    P.insertBefore = P.insertBefore || function(t) { new NQ(t).before(this); return this; };
    P.detach = function() { return this.each(function() { if (this.parentNode) this.parentNode.removeChild(this); }); };
    P.clone = function() { return new NQ(this.toArray().map(function(el) { return el.cloneNode(true); })); };
    P.contents = function() {
        var out = [];
        this.each(function(i, el) { out = out.concat(Array.prototype.slice.call(el.childNodes || [])); });
        return new NQ(out);
    };
    P.siblings = function(sel) {
        var out = [];
        this.each(function(i, el) {
            if (el.parentNode) Array.prototype.forEach.call(el.parentNode.children, function(c) { if (c !== el) out.push(c); });
        });
        var r = new NQ(uniq(out));
        return sel ? r.filter(sel) : r;
    };
    function walk(self, prop, sel) {
        var out = [];
        self.each(function(i, el) {
            for (var n = el[prop]; n; n = n[prop]) if (!sel || matches(n, sel)) out.push(n);
        });
        return new NQ(uniq(out));
    }
    P.nextAll = function(sel) { return walk(this, "nextElementSibling", sel); };
    P.prevAll = function(sel) { return walk(this, "previousElementSibling", sel); };
    P.index = function(sel) {
        var el = this[0];
        if (!el) return -1;
        if (sel === undefined) return Array.prototype.indexOf.call(el.parentNode ? el.parentNode.children : [], el);
        return new NQ(sel).toArray().indexOf(el);
    };
    P.position = function() { var el = this[0]; return el ? {top: el.offsetTop, left: el.offsetLeft} : undefined; };
    P.innerWidth = function() { var el = this[0]; return el ? el.clientWidth : undefined; };
    P.innerHeight = function() { var el = this[0]; return el ? el.clientHeight : undefined; };
    P.hover = function(a, b) { return this.on("mouseenter", a).on("mouseleave", b || a); };
    P.remove = function() { return this.each(function() { if (this.parentNode) this.parentNode.removeChild(this); }); };

    /*** events ***/
    function parseTypes(t) {
        return String(t).split(/\s+/).filter(Boolean).map(function(x) {
            var i = x.indexOf(".");
            return i < 0 ? { type: x, ns: [] } : { type: x.slice(0, i), ns: x.slice(i + 1).split(".") };
        });
    }
    function nsMatch(h, ns) { return !ns.length || ns.every(function(n) { return h.ns.indexOf(n) >= 0; }); }
    P.on = function(types, selector, data, fn) {
        if (typeof selector !== "string") { fn = data || selector; data = undefined; selector = undefined; }
        else if (typeof data === "function") { fn = data; data = undefined; }
        var tl = parseTypes(types);
        return this.each(function() {
            var el = this, list = handlerStore.get(el);
            if (!list) { list = []; handlerStore.set(el, list); }
            tl.forEach(function(t) {
                var wrapped = function(e) {
                    var target = el, args = e.nqArgs || [];
                    if (selector) {
                        var n = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
                        target = n && n.closest ? n.closest(selector) : null;
                        if (!target || !el.contains(target)) return;
                    }
                    if (data !== undefined) e.data = data;
                    if (!e.originalEvent) e.originalEvent = e;
                    if (!e.isDefaultPrevented) {
                        e.isDefaultPrevented = function() { return e.defaultPrevented; };
                        e.isPropagationStopped = function() { return e.cancelBubble; };
                    }
                    if (fn.apply(target, [e].concat(args)) === false) { e.preventDefault(); e.stopPropagation(); }
                };
                list.push({ type: t.type, ns: t.ns, fn: fn, selector: selector, wrapped: wrapped });
                el.addEventListener(t.type, wrapped);
            });
        });
    };
    P.bind = P.on;
    P.one = function(types, selector, data, fn) {
        var self = this, args = Array.prototype.slice.call(arguments), i = args.length - 1, orig = args[i];
        args[i] = function() { self.off(types, orig); return orig.apply(this, arguments); };
        args[i].origFn = orig;
        return P.on.apply(this, args);
    };
    P.off = function(types, selector, fn) {
        if (typeof selector === "function") { fn = selector; selector = undefined; }
        var tl = types ? parseTypes(types) : null;
        return this.each(function() {
            var el = this, list = handlerStore.get(el) || [];
            handlerStore.set(el, list.filter(function(h) {
                var hit = (!tl || tl.some(function(t) { return (!t.type || t.type === h.type) && nsMatch(h, t.ns); })) &&
                    (!fn || h.fn === fn || h.fn.origFn === fn) &&
                    (!selector || selector === "**" || h.selector === selector);
                if (hit) el.removeEventListener(h.type, h.wrapped);
                return !hit;
            }));
        });
    };
    P.unbind = P.off;
    P.trigger = function(type, args) {
        var t = parseTypes(type)[0];
        return this.each(function() {
            if (typeof this[t.type] === "function" && /^(click|focus|blur|select|submit)$/.test(t.type) && !args) this[t.type]();
            else {
                var e = new Event(t.type, { bubbles: true, cancelable: true });
                if (args !== undefined) e.nqArgs = Array.isArray(args) ? args : [args];
                this.dispatchEvent(e);
            }
        });
    };
    P.triggerHandler = function(type, args) { return this.trigger(type, args); };
    ["click", "dblclick", "focus", "blur", "change", "select", "submit", "keydown", "keyup", "keypress", "mousedown", "mouseup", "mouseover", "mouseout", "mousemove", "mouseenter", "mouseleave", "resize", "scroll"].forEach(function(t) {
        P[t] = function(fn) { return fn ? this.on(t, fn) : this.trigger(t); };
    });

    /*** effects ***/
    var defaultDisplay = {};
    function displayFor(el) {
        var tag = el.nodeName;
        if (!defaultDisplay[tag]) {
            var t = document.createElement(tag);
            document.body.appendChild(t);
            defaultDisplay[tag] = getComputedStyle(t).display;
            document.body.removeChild(t);
            if (defaultDisplay[tag] === "none") defaultDisplay[tag] = "block";
        }
        return defaultDisplay[tag];
    }
    function showEl(el) {
        var d = dataStore.get(el) || {};
        dataStore.set(el, d);
        el.style.display = d.__display && d.__display !== "none" ? d.__display : "";
        if (getComputedStyle(el).display === "none") el.style.display = displayFor(el);
    }
    function hideEl(el) {
        var d = dataStore.get(el) || {};
        dataStore.set(el, d);
        var cur = el.style.display;
        if (cur && cur !== "none") d.__display = cur;
        el.style.display = "none";
    }
    function speedOf(s) {
        if (typeof s === "number") return s;
        return SPEEDS[s] !== undefined ? SPEEDS[s] : SPEEDS._default;
    }
    // Splits the (speed, easing, callback) argument forms
    function args(a) {
        var cb = null, speed, i;
        for (i = 0; i < a.length; i++) if (typeof a[i] === "function") cb = a[i];
        var first = a[0];
        speed = (typeof first === "number" || (isString(first) && SPEEDS[first] !== undefined)) ? first : undefined;
        return { speed: speed, cb: cb, first: first };
    }
    // jQuery UI effects (show("blind", opts, speed, fn)) need the jQuery UI plugin
    function viaJQuery(self, method, a) {
        var J = jq();
        if (J && J.fn[method] && isString(a[0]) && SPEEDS[a[0]] === undefined) {
            J(self.toArray())[method].apply(J(self.toArray()), a);
            return true;
        }
        return false;
    }
    function animateEl(el, frames, duration, easing, done) {
        var anim = el.animate ? el.animate(frames, { duration: duration, easing: easing || "ease" }) : null;
        if (!anim || duration === 0) { done(); return; }
        anim.onfinish = done;
        anim.oncancel = done;
    }
    function eachWithCallback(self, cb, fn) {
        var pending = self.length;
        if (!pending) { if (cb) cb.call(self); return self; }
        self.each(function() {
            var el = this;
            fn(el, function() {
                if (cb) cb.call(el);
            });
        });
        return self;
    }
    P.show = function() {
        if (viaJQuery(this, "show", arguments)) return this;
        var a = args(arguments);
        return eachWithCallback(this, a.cb, function(el, done) { showEl(el); done(); });
    };
    P.hide = function() {
        if (viaJQuery(this, "hide", arguments)) return this;
        var a = args(arguments);
        return eachWithCallback(this, a.cb, function(el, done) { hideEl(el); done(); });
    };
    P.toggle = function() {
        if (viaJQuery(this, "toggle", arguments)) return this;
        var a = args(arguments);
        var force = typeof arguments[0] === "boolean" ? arguments[0] : null;
        return eachWithCallback(this, a.cb, function(el, done) {
            var hidden = getComputedStyle(el).display === "none";
            if (force === null ? hidden : force) showEl(el); else hideEl(el);
            done();
        });
    };
    P.fadeOut = function() {
        var a = args(arguments), ms = speedOf(a.speed);
        return eachWithCallback(this, a.cb, function(el, done) {
            if (getComputedStyle(el).display === "none") return done();
            var o = getComputedStyle(el).opacity;
            animateEl(el, [{ opacity: o }, { opacity: 0 }], ms, "ease", function() { hideEl(el); done(); });
        });
    };
    P.fadeIn = function() {
        var a = args(arguments), ms = speedOf(a.speed);
        return eachWithCallback(this, a.cb, function(el, done) {
            var wasHidden = getComputedStyle(el).display === "none";
            if (!wasHidden) return done();
            showEl(el);
            animateEl(el, [{ opacity: 0 }, { opacity: 1 }], ms, "ease", done);
        });
    };
    var BOX = ["height", "paddingTop", "paddingBottom", "marginTop", "marginBottom"];
    function boxFrames(el, open) {
        var cs = getComputedStyle(el), full = {}, zero = {};
        BOX.forEach(function(p) { full[p] = cs[p]; zero[p] = "0px"; });
        zero.overflow = full.overflow = "hidden";
        return open ? [zero, full] : [full, zero];
    }
    P.slideUp = function() {
        var a = args(arguments), ms = speedOf(a.speed);
        return eachWithCallback(this, a.cb, function(el, done) {
            if (getComputedStyle(el).display === "none") return done();
            animateEl(el, boxFrames(el, false), ms, "ease", function() { hideEl(el); done(); });
        });
    };
    P.slideDown = function() {
        var a = args(arguments), ms = speedOf(a.speed);
        return eachWithCallback(this, a.cb, function(el, done) {
            if (getComputedStyle(el).display !== "none") return done();
            showEl(el);
            animateEl(el, boxFrames(el, true), ms, "ease", done);
        });
    };
    P.stop = function() {
        return this.each(function() { if (this.getAnimations) this.getAnimations().forEach(function(a) { a.cancel(); }); });
    };
    P.animate = function(props, speed, easing, cb) {
        if (typeof speed === "function") { cb = speed; speed = undefined; easing = undefined; }
        else if (typeof easing === "function") { cb = easing; easing = undefined; }
        var ms = speedOf(speed);
        var ease = easing === "linear" ? "linear" : "ease-in-out";
        return eachWithCallback(this, cb, function(el, done) {
            var cs = getComputedStyle(el), from = {}, to = {}, scrolls = {};
            Object.keys(props).forEach(function(k) {
                var name = cssName(k), target = props[k];
                if (name === "scrollTop" || name === "scrollLeft") { scrolls[name] = { from: new NQ(el)[name](), to: target }; return; }
                var start = px(cs[name]);
                var end = target;
                if (isString(target) && /^[+-]=/.test(target)) end = start + (target.charAt(0) === "-" ? -1 : 1) * px(target.slice(2));
                else end = px(target);
                var unit = UNITLESS.test(name) ? "" : "px";
                from[name] = start + unit;
                to[name] = end + unit;
            });
            var pending = 0;
            function finish() {
                if (--pending > 0) return;
                Object.keys(to).forEach(function(n) { el.style[n] = to[n]; });
                done();
            }
            if (Object.keys(to).length) { pending++; animateEl(el, [from, to], ms, ease, finish); }
            Object.keys(scrolls).forEach(function(n) {
                pending++;
                var s = scrolls[n], t0 = performance.now();
                (function step(now) {
                    var f = ms === 0 ? 1 : Math.min(1, (now - t0) / ms);
                    new NQ(el)[n](s.from + (s.to - s.from) * f);
                    if (f < 1) requestAnimationFrame(step); else finish();
                })(t0);
            });
            if (!pending) { pending = 1; finish(); }
        });
    };

    global.NQ = NQ;
    if (!global.$) global.$ = NQ;
})(window);
