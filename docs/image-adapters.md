# Image adapters

Image rendering consumes the adapter interface in `src/images/`. `local-static`, `remote-static`, `tiled-manifest`, and `placeholder` are supported. Adapters expose preview/full-image loading, dimensions, tile support, attribution, and license data. A future repository-specific adapter should implement the same interface without changing folio rendering.
