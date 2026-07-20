# Tiled images

The local fixture manifest uses `tileSize`, `width`, `height`, `levels`, and a `{z}/{x}/{y}` template. `tile-manifest.js` parses manifests and calculates visible tiles; `tile-cache.js` supplies bounded LRU storage; `viewport-controller.js` provides pan, zoom, reset, keyboard, pointer, wheel, and double-click behavior.

This is not a complete IIIF viewer. The manifest fields are intentionally close to concepts used by the IIIF Image API, but no IIIF compliance is claimed. A future IIIF adapter can translate `info.json` into this internal manifest shape.
