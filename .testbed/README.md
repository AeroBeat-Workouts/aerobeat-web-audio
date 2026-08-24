# Audio Package Testbed

This hidden testbed owns repo-local tests, demos, scenes, debug data, browser validation, and generated local dependency symlinks for `@aerobeat/web-audio`.

Create `.testbed/node_modules/@aerobeat/web-audio` as a local symlink to the repo root before validating:

```bash
npm run testbed:link-self
```

Add sibling `@aerobeat/web-*` symlinks only for declared public package dependencies.
