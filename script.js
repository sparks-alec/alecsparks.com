(function () {
	'use strict';

	var reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
	function reduced() { return reducedQuery.matches; }
	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	/* PROJECT ACCORDION */
	function animateHeight(el, opening, done) {
		var start = opening && el.hidden ? 0 : el.getBoundingClientRect().height;
		if (el._anim) el._anim.cancel();
		if (opening) el.hidden = false;
		var end = opening ? el.scrollHeight : 0;

		if (reduced() || !el.animate) {
			if (!opening) el.hidden = true;
			if (done) done();
			return;
		}
		var anim = el.animate(
			[{ height: start + 'px' }, { height: end + 'px' }],
			{ duration: 240, easing: 'cubic-bezier(.23, 1, .32, 1)', fill: 'forwards' }
		);
		el._anim = anim;
		anim.onfinish = function () {
			if (el._anim !== anim) return;
			el._anim = null;
			if (!opening) el.hidden = true;
			anim.cancel();
			if (done) done();
		};
	}

	var lastOpened = null;

	function setProject(li, opening) {
		var btn = li.querySelector('.project-toggle');
		var detail = document.getElementById(btn.getAttribute('aria-controls'));
		btn.setAttribute('aria-expanded', opening);
		if (opening) {
			li.classList.add('on');
			animateHeight(detail, true);
			lastOpened = li;
		} else {
			animateHeight(detail, false, function () { li.classList.remove('on'); });
			if (lastOpened === li) lastOpened = null;
		}
	}

	var list = document.querySelector('.section-index ul');

	list.addEventListener('click', function (e) {
		var btn = e.target.closest('.project-toggle');
		if (btn) setProject(btn.closest('li'), btn.getAttribute('aria-expanded') !== 'true');
	});

	/* PROJECTS: rows come from projects.json, newest year first */
	function el(tag, className, text) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (text != null) node.textContent = text;
		return node;
	}

	// photo carousel: a sliding strip with arrows, a counter, drag/swipe, click-to-advance and arrow keys
	function makeGallery(images) {
		var root = el('div', 'gallery');
		var viewport = el('div', 'gallery-viewport');
		viewport.tabIndex = 0;
		viewport.setAttribute('role', 'region');
		viewport.setAttribute('aria-roledescription', 'carousel');
		viewport.setAttribute('aria-label', 'Project photos');
		var track = el('div', 'gallery-track');
		var items = images.map(function (img, i) {
			var fig = el('figure', 'gallery-item');
			fig.setAttribute('aria-label', (i + 1) + ' of ' + images.length);
			var im = el('img');
			im.src = img.src;
			im.alt = img.alt || '';
			im.loading = 'lazy';
			im.decoding = 'async';
			im.draggable = false;
			if (img.width && img.height) {
				im.width = img.width;
				im.height = img.height;
			}
			fig.appendChild(im);
			track.appendChild(fig);
			return fig;
		});
		viewport.appendChild(track);

		var bar = el('div', 'gallery-bar');
		var count = el('span', 'gallery-count');
		count.setAttribute('aria-live', 'polite');
		var credit = el('span', 'gallery-credit');
		var nav = el('div', 'gallery-nav');
		var prev = el('button', null, '←');
		prev.type = 'button';
		prev.setAttribute('aria-label', 'Previous photo');
		var next = el('button', null, '→');
		next.type = 'button';
		next.setAttribute('aria-label', 'Next photo');
		nav.append(prev, next);
		bar.append(count, credit, nav);
		root.append(viewport, bar);

		var index = 0;
		var offset = 0;
		function pad(n) { return (n < 10 ? '0' : '') + n; }
		function maxShift() { return Math.max(0, track.scrollWidth - viewport.clientWidth); }
		function setOffset(x) {
			offset = x;
			track.style.transform = 'translateX(' + (-x).toFixed(1) + 'px)';
		}
		function go(i, instant) {
			index = Math.max(0, Math.min(items.length - 1, i));
			var jump = instant || reduced();
			if (jump) track.classList.add('is-instant');
			// the last photos can't slide past the right edge, so the strip never shows empty space
			setOffset(Math.min(items[index].offsetLeft, maxShift()));
			if (jump) {
				track.offsetHeight;
				track.classList.remove('is-instant');
			}
			items.forEach(function (fig, j) { fig.classList.toggle('is-active', j === index); });
			count.textContent = pad(index + 1) + ' / ' + pad(items.length);
			credit.textContent = images[index].credit || '';
			prev.disabled = index === 0;
			next.disabled = index === items.length - 1;
		}

		prev.addEventListener('click', function () { go(index - 1); });
		next.addEventListener('click', function () { go(index + 1); });
		viewport.addEventListener('keydown', function (e) {
			if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
			else if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
		});

		// drag or swipe follows the pointer with rubber-banding at the ends, then settles on a photo
		var drag = null;
		viewport.addEventListener('pointerdown', function (e) {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			drag = { id: e.pointerId, x: e.clientX, t: performance.now(), base: offset, moved: false };
		});
		viewport.addEventListener('pointermove', function (e) {
			if (!drag || e.pointerId !== drag.id) return;
			var dx = e.clientX - drag.x;
			if (!drag.moved && Math.abs(dx) < 6) return;
			if (!drag.moved) {
				drag.moved = true;
				// capture can fail for pointers the browser isn't tracking; the drag still works without it
				try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
				track.classList.add('is-dragging');
				viewport.classList.add('is-dragging');
			}
			var x = drag.base - dx;
			var max = maxShift();
			if (x < 0) x *= .3;
			else if (x > max) x = max + (x - max) * .3;
			setOffset(x);
		});
		function endDrag(e) {
			if (!drag || e.pointerId !== drag.id) return;
			var d = drag;
			drag = null;
			track.classList.remove('is-dragging');
			viewport.classList.remove('is-dragging');
			if (e.type === 'pointercancel') { go(index); return; }
			if (!d.moved) {
				// a plain click: jump to that photo, or advance (wrapping) when it's already showing
				var j = items.indexOf(e.target.closest ? e.target.closest('.gallery-item') : null);
				if (j !== -1) go(j === index ? (index + 1) % items.length : j);
				return;
			}
			var dx = e.clientX - d.x;
			var v = dx / Math.max(1, performance.now() - d.t);
			if (dx < -50 || v < -.4) go(index + 1);
			else if (dx > 50 || v > .4) go(index - 1);
			else go(index);
		}
		viewport.addEventListener('pointerup', endDrag);
		viewport.addEventListener('pointercancel', endDrag);

		// the row starts hidden (zero size); re-align once it opens and whenever it resizes
		if ('ResizeObserver' in window) new ResizeObserver(function () { go(index, true); }).observe(viewport);
		go(0, true);
		return root;
	}

	function renderProject(p, index) {
		var id = 'project-' + index;
		var li = el('li');

		// upcoming shows are listed greyed out, with nothing to expand yet
		if (p.upcoming) {
			li.className = 'upcoming';
			var soon = el('span', 'year');
			soon.appendChild(el('span', 'new', 'Upcoming'));
			if (p.year) soon.appendChild(el('span', 'number', p.year));
			var row = el('div', 'top');
			row.append(el('span', 'client', p.name), el('span', 'role', p.role), el('span', 'type', p.type), soon);
			li.appendChild(row);
			return li;
		}

		var btn = el('button', 'project-toggle');
		btn.type = 'button';
		btn.setAttribute('aria-expanded', 'false');
		btn.setAttribute('aria-controls', id);
		var year = el('span', 'year');
		if (p.badge) year.appendChild(el('span', 'new', p.badge));
		year.appendChild(el('span', 'number', p.year));
		btn.append(el('span', 'client', p.name), el('span', 'role', p.role), el('span', 'type', p.type), year);
		var top = el('div', 'top');
		top.appendChild(btn);

		var about = el('div', 'about');
		// descriptions are trusted content from projects.json, so inline HTML like <a href="…">links</a> renders
		var desc = el('p');
		desc.innerHTML = p.description || '';
		desc.querySelectorAll('a[href^="http"]').forEach(function (a) {
			a.target = '_blank';
			a.rel = 'noopener';
		});
		about.appendChild(desc);
		var command = el('div', 'command');
		(p.links || []).forEach(function (link, i) {
			var a = el('a', i === 0 ? 'visit' : 'visit alt', link.label + ' ↗');
			a.href = link.url;
			command.appendChild(a);
		});
		var infos = el('div', 'infos');
		infos.append(about, command);
		var detail = el('div', 'detail');
		detail.id = id;
		detail.hidden = true;
		detail.appendChild(infos);

		// optional photo carousel under the description; images only load once the row is opened
		if (p.images && p.images.length) detail.appendChild(makeGallery(p.images));

		li.append(top, detail);
		return li;
	}

	// years are strings like "2026" or "2024–2026"; sort by the first 4-digit year, 0 when there isn't one
	function sortYear(p) {
		var match = String(p.year || '').match(/\d{4}/);
		return match ? parseInt(match[0], 10) : 0;
	}

	fetch('projects.json')
		.then(function (res) {
			if (!res.ok) throw new Error('HTTP ' + res.status);
			return res.json();
		})
		.then(function (projects) {
			projects
				.map(function (p, i) { return { p: p, i: i }; })
				.sort(function (a, b) {
					return (b.p.upcoming ? 1 : 0) - (a.p.upcoming ? 1 : 0)
						|| sortYear(b.p) - sortYear(a.p)
						|| a.i - b.i;
				})
				.forEach(function (entry, n) { list.appendChild(renderProject(entry.p, n)); });
		})
		.catch(function (err) {
			var li = el('li', 'head');
			li.appendChild(el('div', 'top', 'Couldn’t load projects.json (' + err.message + ')'));
			list.appendChild(li);
		});

	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && lastOpened) {
			var li = lastOpened;
			setProject(li, false);
			li.querySelector('.project-toggle').focus();
		}
	});

	/* BEZIER WARP: drag corner rings and tangent handles to bend the test pattern */
	var warp = document.querySelector('.warp');
	if (!warp) return;

	var canvas = warp.querySelector('.warp-canvas');
	var ctx = canvas.getContext('2d');
	var handles = warp.querySelectorAll('.warp-handle');
	// the pattern is laid out in a 640×360 raster, 16×9 grid cells of 40px
	var RASTER_W = 640, RASTER_H = 360, COLS = 16, ROWS = 9;
	var FONT = '500 12px "JetBrains Mono", Menlo, Consolas, monospace';
	// colors come from the page's CSS tokens, so the drawing follows light and dark mode
	var palette = {};
	function readPalette() {
		var cs = getComputedStyle(document.documentElement);
		palette.surface = cs.getPropertyValue('--pin-surface').trim() || '#f1efe8';
		palette.ink = cs.getPropertyValue('--pin-ink').trim() || '#1d1c1a';
		palette.plate = cs.getPropertyValue('--pin-plate').trim() || '#111110';
		palette.accent = cs.getPropertyValue('--accent').trim() || '#ffbb19';
	}
	readPalette();
	// widest gamut first; .matches stays live as the window moves between displays
	var GAMUTS = [
		['Rec. 2020', window.matchMedia('(color-gamut: rec2020)')],
		['Display P3', window.matchMedia('(color-gamut: p3)')]
	];

	// the viewer's own display, like a media server's output readout
	function outputLabel() {
		var dpr = window.devicePixelRatio || 1;
		var gamut = 'sRGB';
		for (var i = 0; i < GAMUTS.length; i++) {
			if (GAMUTS[i][1].matches) { gamut = GAMUTS[i][0]; break; }
		}
		return 'OUTPUT 1 · ' + Math.round(screen.width * dpr) + ' × ' + Math.round(screen.height * dpr) + ' · ' + gamut;
	}

	// the viewer's machine, read once: OS, CPU threads and GPU where the browser shares them
	function gpuName() {
		try {
			var gl = document.createElement('canvas').getContext('webgl');
			if (!gl) return '';
			var ext = gl.getExtension('WEBGL_debug_renderer_info');
			var renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
			var lose = gl.getExtension('WEBGL_lose_context');
			if (lose) lose.loseContext();
			if (!renderer) return '';
			// "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)" → "Apple M2 Max"
			var angle = renderer.match(/ANGLE \([^,]*,\s*(?:ANGLE [^:]*:\s*)?([^,]+?)(?:\s+Direct3D.*|\s+\(0x.*)?,/);
			// drop driver details like " (radeonsi, navi21, …)" but keep "Intel(R)"
			return (angle ? angle[1] : renderer).replace(/\s+\(.*$/, '').trim();
		} catch (e) {
			return '';
		}
	}

	function machineLabel() {
		var ua = navigator.userAgent;
		var os = /iPhone|iPod/.test(ua) ? 'iOS'
			: /iPad/.test(ua) ? 'iPadOS'
			: /Android/.test(ua) ? 'Android'
			: /Macintosh/.test(ua) ? (navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS')
			: /Windows/.test(ua) ? 'Windows'
			: /CrOS/.test(ua) ? 'ChromeOS'
			: /Linux/.test(ua) ? 'Linux' : '';
		var parts = [os];
		if (navigator.hardwareConcurrency) parts.push(navigator.hardwareConcurrency + ' threads');
		parts.push(gpuName());
		return parts.filter(Boolean).join(' · ');
	}
	var MACHINE = machineLabel();

	var NAME = 'ALEC SPARKS';
	var NAME_FONT = '800 104px "Big Shoulders Display", "Arial Narrow", "Helvetica Neue", sans-serif';
	var NAME_SRC_SCALE = 3;
	// the name is drawn flat once, then texture-mapped onto the warp through a triangle mesh
	var nameSrc = document.createElement('canvas');
	var nameLayer = document.createElement('canvas');
	var nameBox = null;
	var nameVersion = 0;
	var nameKey = '';

	function drawNameSource() {
		nameSrc.width = RASTER_W * NAME_SRC_SCALE;
		nameSrc.height = RASTER_H * NAME_SRC_SCALE;
		var sc = nameSrc.getContext('2d');
		sc.setTransform(NAME_SRC_SCALE, 0, 0, NAME_SRC_SCALE, 0, 0);
		sc.font = NAME_FONT;
		sc.textAlign = 'left';
		sc.textBaseline = 'alphabetic';
		// white name on a very dark gray plate, in both themes
		sc.fillStyle = '#fff';
		// center the letters' actual ink in the plate (all caps, so the cap height is what reads as centered)
		var ink = sc.measureText(NAME);
		var inkW = ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight;
		sc.fillText(NAME,
			RASTER_W / 2 - inkW / 2 + ink.actualBoundingBoxLeft,
			RASTER_H / 2 + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2);
		// dark plate behind the name, snapped to whole grid cells
		var half = sc.measureText(NAME).width / 2 + 16;
		var cell = RASTER_W / COLS;
		var x0 = Math.floor((RASTER_W / 2 - half) / cell) * cell;
		nameBox = { x0: x0, x1: RASTER_W - x0, y0: 120, y1: 240 };
		nameVersion++;
	}
	drawNameSource();

	// recolor everything, including the pre-drawn name, when the system theme flips
	var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
	if (darkQuery.addEventListener) {
		darkQuery.addEventListener('change', function () {
			readPalette();
			drawNameSource();
			requestRender();
		});
	}

	// draw the part of nameSrc inside source triangle s onto destination triangle d with one affine transform
	function mapTriangle(lc, s0, s1, s2, d0, d1, d2) {
		var sx1 = s1[0] - s0[0], sy1 = s1[1] - s0[1], sx2 = s2[0] - s0[0], sy2 = s2[1] - s0[1];
		var det = sx1 * sy2 - sx2 * sy1;
		if (!det) return;
		var dx1 = d1[0] - d0[0], dy1 = d1[1] - d0[1], dx2 = d2[0] - d0[0], dy2 = d2[1] - d0[1];
		var a = (dx1 * sy2 - dx2 * sy1) / det, c = (dx2 * sx1 - dx1 * sx2) / det;
		var b = (dy1 * sy2 - dy2 * sy1) / det, d = (dy2 * sx1 - dy1 * sx2) / det;
		// grow the clip a device pixel so neighbouring triangles overlap instead of leaving hairline seams
		var cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
		lc.save();
		lc.beginPath();
		[d0, d1, d2].forEach(function (p, i) {
			var len = Math.hypot(p[0] - cx, p[1] - cy) || 1;
			var gx = p[0] + (p[0] - cx) / len, gy = p[1] + (p[1] - cy) / len;
			if (i) lc.lineTo(gx, gy); else lc.moveTo(gx, gy);
		});
		lc.closePath();
		lc.clip();
		lc.setTransform(a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]);
		var minX = Math.min(s0[0], s1[0], s2[0]) - 2, minY = Math.min(s0[1], s1[1], s2[1]) - 2;
		var sw = Math.max(s0[0], s1[0], s2[0]) + 2 - minX, sh = Math.max(s0[1], s1[1], s2[1]) + 2 - minY;
		lc.drawImage(nameSrc, minX, minY, sw, sh, minX, minY, sw, sh);
		lc.restore();
	}

	// the shape, normalized to the wall: four corners clockwise from top left, plus each edge's two
	// Bezier tangent handles (the edge's inner control points), like After Effects' Bezier Warp
	var EDGES = [['top', 0, 1], ['right', 1, 2], ['bottom', 3, 2], ['left', 0, 3]];
	// the tangent handles that belong to each corner, so they travel with it
	var OWNED = [
		[['top', 0], ['left', 0]],
		[['top', 1], ['right', 0]],
		[['right', 1], ['bottom', 1]],
		[['left', 1], ['bottom', 0]]
	];

	function straightHandles(c) {
		var h = {};
		EDGES.forEach(function (e) {
			var a = c[e[1]], b = c[e[2]];
			h[e[0]] = [
				[a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
				[a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3]
			];
		});
		return h;
	}

	function copyShape(s) {
		var h = {};
		Object.keys(s.h).forEach(function (k) { h[k] = s.h[k].map(function (p) { return p.slice(); }); });
		return { c: s.c.map(function (p) { return p.slice(); }), h: h };
	}

	function lerpShape(a, b, k) {
		function mix(p, q) { return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]; }
		var h = {};
		Object.keys(a.h).forEach(function (e) { h[e] = [mix(a.h[e][0], b.h[e][0]), mix(a.h[e][1], b.h[e][1])]; });
		return { c: a.c.map(function (p, i) { return mix(p, b.c[i]); }), h: h };
	}

	// every control point in a fixed order, for measuring how far a new shape moved
	function shapePoints(s) {
		var list = s.c.slice();
		EDGES.forEach(function (e) { list.push(s.h[e[0]][0], s.h[e[0]][1]); });
		return list;
	}

	// a fresh warp: jitter a centered rectangle's corners (kept convex), then bow each edge by pushing its
	// handles off the straight line; when `from` is given, prefer shapes that land noticeably far from it
	function randomShape(from) {
		var base = [[.14, .14], [.86, .14], [.86, .86], [.14, .86]];
		var fallback = null;
		for (var attempt = 0; attempt < 40; attempt++) {
			var corners = base.map(function (c) {
				return [clamp(c[0] + (Math.random() * 2 - 1) * .11, .02, .98), clamp(c[1] + (Math.random() * 2 - 1) * .11, .02, .98)];
			});
			if (!isConvex(corners)) continue;
			var next = { c: corners, h: straightHandles(corners) };
			EDGES.forEach(function (e) {
				var a = corners[e[1]], b = corners[e[2]];
				var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
				next.h[e[0]].forEach(function (p) {
					var bend = (Math.random() * 2 - 1) * .08;
					p[0] = clamp(p[0] - dy / len * bend, .01, .99);
					p[1] = clamp(p[1] + dx / len * bend, .01, .99);
				});
			});
			if (!from) return next;
			var pa = shapePoints(next), pb = shapePoints(from);
			var moved = pa.reduce(function (sum, p, i) { return sum + Math.hypot(p[0] - pb[i][0], p[1] - pb[i][1]); }, 0);
			if (moved > .5) return next;
			fallback = fallback || next;
		}
		var safe = [[.135, .19], [.885, .13], [.845, .87], [.115, .79]];
		return fallback || { c: safe, h: straightHandles(safe) };
	}
	var shape = randomShape();
	var dragging = false;
	var tween = 0;

	function bez(p0, p1, p2, p3, t) {
		var s = 1 - t, a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t;
		return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
	}

	// a Coons patch: the surface blends between its four Bezier edges
	function surfacePoint(s, u, v, w, hgt) {
		var c = s.c, h = s.h;
		var top = bez(c[0], h.top[0], h.top[1], c[1], u);
		var bottom = bez(c[3], h.bottom[0], h.bottom[1], c[2], u);
		var left = bez(c[0], h.left[0], h.left[1], c[3], v);
		var right = bez(c[1], h.right[0], h.right[1], c[2], v);
		var x = (1 - v) * top[0] + v * bottom[0] + (1 - u) * left[0] + u * right[0]
			- ((1 - u) * (1 - v) * c[0][0] + u * (1 - v) * c[1][0] + (1 - u) * v * c[3][0] + u * v * c[2][0]);
		var y = (1 - v) * top[1] + v * bottom[1] + (1 - u) * left[1] + u * right[1]
			- ((1 - u) * (1 - v) * c[0][1] + u * (1 - v) * c[1][1] + (1 - u) * v * c[3][1] + u * v * c[2][1]);
		return [x * w, y * hgt];
	}

	// a crossed, folded or collapsed set of corners can't make a sensible surface, so refuse moves that make one
	function isConvex(p) {
		var sign = 0;
		for (var i = 0; i < 4; i++) {
			var a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
			var edgeIn = Math.hypot(b[0] - a[0], b[1] - a[1]);
			var edgeOut = Math.hypot(c[0] - b[0], c[1] - b[1]);
			if (edgeIn < .15) return false;
			var cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
			// sine of the turn at this corner: keeps every interior angle between ~15° and ~165°
			if (Math.abs(cross) / (edgeIn * edgeOut) < .26) return false;
			if (!sign) sign = Math.sign(cross);
			else if (Math.sign(cross) !== sign) return false;
		}
		return true;
	}

	// Drawn on canvas rather than with CSS so the warp never depends on 3D compositing.
	// Straight lines in the raster become curves on the surface, so everything is traced with samples.
	function render() {
		var w = warp.clientWidth, hgt = warp.clientHeight;
		if (!w || !hgt) return;
		var dpr = window.devicePixelRatio || 1;
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(hgt * dpr);
		}

		function project(u, v) { return surfacePoint(shape, u, v, w, hgt); }
		function trace(u0, v0, u1, v1, n, cont) {
			for (var i = 0; i <= n; i++) {
				var p = project(u0 + (u1 - u0) * i / n, v0 + (v1 - v0) * i / n);
				if (i === 0 && !cont) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
			}
		}
		function line(u0, v0, u1, v1) {
			trace(u0, v0, u1, v1, Math.max(2, Math.ceil(Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0)) * 40)));
		}
		function region(u0, v0, u1, v1, n) {
			ctx.beginPath();
			trace(u0, v0, u1, v0, n);
			trace(u1, v0, u1, v1, n, true);
			trace(u1, v1, u0, v1, n, true);
			trace(u0, v1, u0, v0, n, true);
			ctx.closePath();
		}
		function outline() { region(0, 0, 1, 1, 48); }
		var WIPE_BAND = .08;
		// a bar trailing a leading line at s along one axis; s runs past 1 so the bar slides
		// fully off instead of vanishing, and the surface outline clips it
		function wipe(s, axis, bandColor, lineColor, bandAlpha) {
			var head = Math.min(s, 1), tail = s - WIPE_BAND;
			ctx.save();
			outline();
			ctx.clip();
			if (axis === 'x') region(tail, 0, head, 1, 24); else region(0, tail, 1, head, 24);
			ctx.fillStyle = bandColor;
			ctx.globalAlpha = bandAlpha;
			ctx.fill();
			ctx.globalAlpha = 1;
			if (s <= 1) {
				ctx.lineWidth = 1.5;
				ctx.strokeStyle = lineColor;
				ctx.beginPath();
				if (axis === 'x') line(s, 0, s, 1); else line(0, s, 1, s);
				ctx.stroke();
			}
			ctx.restore();
		}
		// average raster-to-screen scale, from the area inside a sampled outline (shoelace)
		var ringPts = [];
		for (var side = 0; side < 4; side++) {
			for (var q = 0; q < 12; q++) {
				var f = q / 12;
				ringPts.push(side === 0 ? project(f, 0) : side === 1 ? project(1, f) : side === 2 ? project(1 - f, 1) : project(0, 1 - f));
			}
		}
		var area = 0;
		ringPts.forEach(function (p, i) {
			var nq = ringPts[(i + 1) % ringPts.length];
			area += p[0] * nq[1] - nq[0] * p[1];
		});
		var baseScale = Math.sqrt(Math.abs(area) / 2 / (RASTER_W * RASTER_H));

		// each small mesh cell is nearly affine, so two affine triangles per cell track the curve closely
		function buildNameLayer() {
			// reallocating a canvas is expensive, so only resize when the size really changed
			if (nameLayer.width !== canvas.width || nameLayer.height !== canvas.height) {
				nameLayer.width = canvas.width;
				nameLayer.height = canvas.height;
			}
			var lc = nameLayer.getContext('2d');
			lc.setTransform(1, 0, 0, 1, 0, 0);
			lc.clearRect(0, 0, nameLayer.width, nameLayer.height);
			// curves need a finer mesh than a corner pin; coarse keeps dragging smooth, fine is rebuilt on release
			var NX = dragging ? 16 : 40, NY = dragging ? 4 : 10, S = NAME_SRC_SCALE;
			var bw = nameBox.x1 - nameBox.x0, bh = nameBox.y1 - nameBox.y0;
			for (var i = 0; i < NX; i++) {
				for (var j = 0; j < NY; j++) {
					var xa = nameBox.x0 + bw * i / NX, xb = nameBox.x0 + bw * (i + 1) / NX;
					var ya = nameBox.y0 + bh * j / NY, yb = nameBox.y0 + bh * (j + 1) / NY;
					var cellCorners = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
					var dst = cellCorners.map(function (r) {
						var p = project(r[0] / RASTER_W, r[1] / RASTER_H);
						return [p[0] * dpr, p[1] * dpr];
					});
					var src = cellCorners.map(function (r) { return [r[0] * S, r[1] * S]; });
					mapTriangle(lc, src[0], src[1], src[2], dst[0], dst[1], dst[2]);
					mapTriangle(lc, src[0], src[2], src[3], dst[0], dst[2], dst[3]);
				}
			}
		}

		// text uses the local linear approximation of the warp at its anchor,
		// skipped where extreme warping would smear it
		function label(str, x, y, align) {
			var u = x / RASTER_W, v = y / RASTER_H, e = .001;
			var p = project(u, v), pu = project(u + e, v), pv = project(u, v + e);
			var ax = (pu[0] - p[0]) / (e * RASTER_W), ay = (pu[1] - p[1]) / (e * RASTER_W);
			var bx = (pv[0] - p[0]) / (e * RASTER_H), by = (pv[1] - p[1]) / (e * RASTER_H);
			var scale = Math.sqrt(Math.abs(ax * by - ay * bx));
			if (scale > baseScale * 2 || scale < baseScale * .4) return;
			ctx.setTransform(dpr * ax, dpr * ay, dpr * bx, dpr * by, dpr * p[0], dpr * p[1]);
			var width = ctx.measureText(str).width;
			var left = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
			ctx.fillStyle = palette.surface;
			ctx.fillRect(left - 5, -9, width + 10, 18);
			ctx.fillStyle = palette.ink;
			ctx.fillText(str, left, 0);
		}

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, hgt);

		// paper
		outline();
		ctx.fillStyle = palette.surface;
		ctx.fill();

		// big circle outline on the paper, under the grid: traced in raster space so it warps with the surface
		ctx.beginPath();
		for (var k = 0; k <= 120; k++) {
			var ang = k / 120 * Math.PI * 2;
			var cp = project((RASTER_W / 2 + 168 * Math.cos(ang)) / RASTER_W, (RASTER_H / 2 + 168 * Math.sin(ang)) / RASTER_H);
			if (k) ctx.lineTo(cp[0], cp[1]); else ctx.moveTo(cp[0], cp[1]);
		}
		ctx.closePath();
		ctx.globalAlpha = .55;
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = palette.ink;
		ctx.stroke();
		ctx.globalAlpha = 1;

		ctx.strokeStyle = palette.ink;
		ctx.lineWidth = 1;

		// hairline grid
		ctx.globalAlpha = .1;
		ctx.beginPath();
		for (var c = 1; c < COLS; c++) line(c / COLS, 0, c / COLS, 1);
		for (var r = 1; r < ROWS; r++) line(0, r / ROWS, 1, r / ROWS);
		ctx.stroke();

		// dashed diagonals under a solid center cross
		ctx.globalAlpha = .35;
		ctx.setLineDash([3, 5]);
		ctx.beginPath();
		line(0, 0, 1, 1);
		line(1, 0, 0, 1);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.globalAlpha = .5;
		ctx.beginPath();
		line(.5, 0, .5, 1);
		line(0, .5, 1, .5);
		ctx.stroke();

		// ruler ticks on all four edges: short at each cell, long at every fourth column and third row
		ctx.globalAlpha = .8;
		ctx.beginPath();
		for (var tc = 1; tc < COLS; tc++) {
			var tickV = (tc % 4 ? 5 : 11) / RASTER_H;
			line(tc / COLS, 0, tc / COLS, tickV);
			line(tc / COLS, 1, tc / COLS, 1 - tickV);
		}
		for (var tr = 1; tr < ROWS; tr++) {
			var tickU = (tr % 3 ? 5 : 11) / RASTER_W;
			line(0, tr / ROWS, tickU, tr / ROWS);
			line(1, tr / ROWS, 1 - tickU, tr / ROWS);
		}
		ctx.stroke();
		ctx.globalAlpha = 1;

		// plate behind the name knocks out the grid
		function plate() {
			region(nameBox.x0 / RASTER_W, nameBox.y0 / RASTER_H, nameBox.x1 / RASTER_W, nameBox.y1 / RASTER_H, 32);
		}
		// output and machine info sit under the wipes, so the wipes sweep across them
		ctx.font = FONT;
		ctx.textBaseline = 'middle';
		label(outputLabel(), 320, 26, 'center');
		if (MACHINE) label(MACHINE, 320, 50, 'center');
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// X and Y wipes, like a media server's moving test lines: same raster speed on both axes
		if (!reduced()) {
			// wall-clock time, so the wipes carry on from where they were instead of restarting on refresh
			var t = Date.now() / 1000;
			// 8s and 4.5s per raster width/height, stretched to cover the extra run-out
			var run = 1 + WIPE_BAND;
			wipe((t % (8 * run)) / 8, 'x', palette.accent, palette.accent, .2);
			wipe((t % (4.5 * run)) / 4.5, 'y', palette.ink, palette.ink, .06);
		}

		// the name's plate is filled after the wipes, so it knocks them out and the name stays clean
		plate();
		ctx.fillStyle = palette.plate;
		ctx.fill();

		outline();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = palette.ink;
		ctx.stroke();

		ctx.font = FONT;
		ctx.textBaseline = 'middle';
		label('1', 22, 26, 'left');
		label('2', 618, 26, 'right');
		label('3', 618, 334, 'right');
		label('4', 22, 334, 'left');

		// the mapped name only needs rebuilding when the warp or canvas size changes, not every wipe frame
		var key = nameVersion + '|' + dragging + '|' + canvas.width + 'x' + canvas.height + '|' + JSON.stringify(shape);
		if (key !== nameKey) {
			buildNameLayer();
			nameKey = key;
		}
		// border on the name's plate, drawn above the wipes so it stays crisp
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		plate();
		ctx.lineWidth = 1;
		ctx.strokeStyle = palette.ink;
		ctx.stroke();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(nameLayer, 0, 0);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// guide lines from each corner out to its tangent handles
		ctx.lineWidth = 1;
		ctx.strokeStyle = palette.ink;
		ctx.globalAlpha = .45;
		ctx.beginPath();
		OWNED.forEach(function (owned, i) {
			var cx = shape.c[i][0] * w, cy = shape.c[i][1] * hgt;
			owned.forEach(function (o) {
				var tp = shape.h[o[0]][o[1]];
				ctx.moveTo(cx, cy);
				ctx.lineTo(tp[0] * w, tp[1] * hgt);
			});
		});
		ctx.stroke();
		ctx.globalAlpha = 1;

		handleEls.forEach(function (hd) {
			var p = pointFor(hd);
			hd.el.style.transform = 'translate(' + (p[0] * w).toFixed(1) + 'px,' + (p[1] * hgt).toFixed(1) + 'px)';
		});
	}

	// corner buttons carry data-corner; tangent buttons carry data-edge and data-index
	var handleEls = Array.prototype.map.call(handles, function (el) {
		var edge = el.getAttribute('data-edge');
		return edge
			? { el: el, edge: edge, index: +el.getAttribute('data-index') }
			: { el: el, corner: +el.getAttribute('data-corner') };
	});

	function pointFor(hd) {
		return hd.edge ? shape.h[hd.edge][hd.index] : shape.c[hd.corner];
	}

	function moveHandle(hd, x, y) {
		var next = copyShape(shape);
		x = clamp(x, .01, .99);
		y = clamp(y, .01, .99);
		if (hd.edge) {
			next.h[hd.edge][hd.index] = [x, y];
		} else {
			var old = next.c[hd.corner];
			var dx = x - old[0], dy = y - old[1];
			next.c[hd.corner] = [x, y];
			if (!isConvex(next.c)) return;
			// a corner's tangent handles travel with it
			OWNED[hd.corner].forEach(function (o) {
				var p = next.h[o[0]][o[1]];
				next.h[o[0]][o[1]] = [clamp(p[0] + dx, .01, .99), clamp(p[1] + dy, .01, .99)];
			});
		}
		shape = next;
		requestRender();
	}

	handleEls.forEach(function (hd) {
		var handle = hd.el;
		handle.addEventListener('pointerdown', function (e) {
			if (e.button !== 0) return;
			e.preventDefault();
			cancelAnimationFrame(tween);
			handle.setPointerCapture(e.pointerId);
			handle.classList.add('is-dragging');
			dragging = true;
			var rect = warp.getBoundingClientRect();
			var start = pointFor(hd).slice();
			var ox = e.clientX, oy = e.clientY;

			function drag(ev) {
				moveHandle(hd, start[0] + (ev.clientX - ox) / rect.width, start[1] + (ev.clientY - oy) / rect.height);
			}
			function release() {
				handle.classList.remove('is-dragging');
				dragging = false;
				requestRender();
				handle.removeEventListener('pointermove', drag);
				handle.removeEventListener('pointerup', release);
				handle.removeEventListener('pointercancel', release);
			}
			handle.addEventListener('pointermove', drag);
			handle.addEventListener('pointerup', release);
			handle.addEventListener('pointercancel', release);
		});

		handle.addEventListener('keydown', function (e) {
			var step = e.shiftKey ? .05 : .01;
			var delta = {
				ArrowLeft: [-step, 0], ArrowRight: [step, 0],
				ArrowUp: [0, -step], ArrowDown: [0, step]
			}[e.key];
			if (!delta) return;
			e.preventDefault();
			cancelAnimationFrame(tween);
			dragging = false;
			var p = pointFor(hd);
			moveHandle(hd, p[0] + delta[0], p[1] + delta[1]);
		});
	});

	// glide every control point to a new random warp; the name uses its coarse mesh while moving, like a drag
	function reshuffle() {
		cancelAnimationFrame(tween);
		var from = copyShape(shape);
		var to = randomShape(from);
		if (reduced()) {
			shape = to;
			dragging = false;
			requestRender();
			return;
		}
		var t0 = performance.now();
		dragging = true;
		function step(now) {
			var p = Math.min(1, (now - t0) / 700);
			var k = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
			shape = lerpShape(from, to, k);
			if (p < 1) {
				tween = requestAnimationFrame(step);
			} else {
				dragging = false;
			}
			requestRender();
		}
		tween = requestAnimationFrame(step);
	}

	// ⌘R / Ctrl+R / F5 re-warp instead of reloading; Shift variants still do a real reload.
	// The browser's reload button can't be intercepted, and a real reload still picks a random warp.
	document.addEventListener('keydown', function (e) {
		if (e.shiftKey || e.altKey) return;
		var isReload = e.key === 'F5' || ((e.metaKey || e.ctrlKey) && (e.key === 'r' || e.key === 'R'));
		if (!isReload) return;
		e.preventDefault();
		reshuffle();
	});

	// redraw every frame for the wipes, but only while the wall is on screen
	var rafId = 0;
	var onScreen = true;

	function frame() {
		rafId = 0;
		render();
		schedule();
	}
	function schedule() {
		if (!rafId && onScreen && !document.hidden && !reduced()) rafId = requestAnimationFrame(frame);
	}
	// one redraw on the next frame, however many pointer or key events arrive before it
	function requestRender() {
		if (!rafId) rafId = requestAnimationFrame(frame);
	}

	if ('IntersectionObserver' in window) {
		new IntersectionObserver(function (entries) {
			onScreen = entries[0].isIntersecting;
			schedule();
		}).observe(warp);
	}
	document.addEventListener('visibilitychange', schedule);
	if (reducedQuery.addEventListener) {
		reducedQuery.addEventListener('change', function () { render(); schedule(); });
	}
	if ('ResizeObserver' in window) new ResizeObserver(render).observe(warp);
	else window.addEventListener('resize', render);
	// the name's font is only used on canvas, so nothing in the DOM triggers its download: ask for it
	if (document.fonts) {
		Promise.all([document.fonts.ready, document.fonts.load(NAME_FONT)]).then(function () {
			drawNameSource();
			render();
		});
	}
	// refresh continuity: remember the warp when leaving, and on the next load glide from it to a new one.
	// Safari reloads on ⌘R before the page ever sees the key, so this is what makes its refresh animate
	// (and the toolbar reload button, and pull-to-refresh). sessionStorage only; nothing leaves the browser.
	var STORE_KEY = 'alecsparks-warp';
	window.addEventListener('pagehide', function () {
		try {
			sessionStorage.setItem(STORE_KEY, JSON.stringify({ shape: shape }));
		} catch (e) {}
	});
	function isPoint(p) { return Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]); }
	var restored = false;
	try {
		var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
		if (saved && saved.shape && Array.isArray(saved.shape.c) && saved.shape.c.length === 4 && saved.shape.c.every(isPoint) &&
			saved.shape.h && EDGES.every(function (e) { var hp = saved.shape.h[e[0]]; return Array.isArray(hp) && hp.length === 2 && hp.every(isPoint); }) &&
			isConvex(saved.shape.c)) {
			shape = saved.shape;
			restored = true;
		} else if (saved && Array.isArray(saved.corners) && saved.corners.length === 4 && saved.corners.every(isPoint) && isConvex(saved.corners)) {
			// a warp saved before Bezier edges: start from its corners with straight edges
			shape = { c: saved.corners, h: straightHandles(saved.corners) };
			restored = true;
		}
	} catch (e) {}

	render();
	schedule();
	if (restored) reshuffle();
})();
