# Shajrah — Malikan Awan Family Tree

Interactive Urdu family tree (شجرہ نسب). **Public site is read-only** — search, explore, and view lineage.

## Live site (GitHub Pages)

After setup, the site will be at:

`https://<your-username>.github.io/<repo-name>/`

## Deploy to GitHub Pages

1. Create a new GitHub repository and push this project.
2. In the repo: **Settings → Pages → Build and deployment**
   - Source: **GitHub Actions**
3. Push to `main` — the workflow in `.github/workflows/pages.yml` publishes the `shajrah/` folder automatically.

Only these files are published:

```
shajrah/
  index.html      ← public viewer
  app.js
  styles.css
  data/
    master_tree.json
    tree_version.json
```

Editor tools, Python scripts, CSV files, and backups stay in the repo but are **not** on the public website.

## Update the tree (local, for maintainers)

1. Edit `master_tree.json` or use local editor tools.
2. Run:
   ```powershell
   python sync_tree.py
   ```
3. Commit and push — GitHub Pages redeploys on push to `main`.

### Local editor tools (not deployed)

Run from project root:

```powershell
python serve.py
```

Then open:

- Public viewer: http://127.0.0.1:8080/shajrah/
- Name editor: http://127.0.0.1:8080/tools/editor/edit.html
- Link editor: http://127.0.0.1:8080/tools/editor/link.html
- Photo review: http://127.0.0.1:8080/tools/editor/review.html

## Project layout

| Path | Purpose |
|------|---------|
| `shajrah/` | **Public website** (GitHub Pages) |
| `tools/editor/` | Local-only editing UI |
| `master_tree.json` | Source of truth for tree data |
| `sync_tree.py` | Sync JSON → website + CSVs |
| `serve.py` | Local dev server with save API |
| `backups/` | Auto backups before saves |
