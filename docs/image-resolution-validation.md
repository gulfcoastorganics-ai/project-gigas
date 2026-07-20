# Image-resolution validation

The first-page resolver requires the selected page record to contain the requested `sourceId` and page number. Its resolved path must be inside `data/candidates/folio-images/<sourceId>/`, the file must exist, and its SHA-256 must equal the selection hash. Mapping evidence is also required.

The preview command is:

```sh
npm run preview:first-page -- --source-id=<source-id> --page=1
```

JPEG sources produce `preview.jpg`. JPEG 2000 sources retain their original `preview.jp2` bytes when no lossless conversion utility is available; the manifest records the actual MIME and hash rather than mislabeling the file.
