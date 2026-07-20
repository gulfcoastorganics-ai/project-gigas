# Cache versioning

Sprint 4 increments the service-worker shell cache to `gigas-shell-v4`. Old caches are removed during activation. Runtime caching is limited to same-origin shell/local fixture paths; remote scans are never silently cached. IndexedDB bookmarks/preferences are separate and are not cleared by shell updates. Future checksum-keyed asset URLs should be used when real derivatives change.
