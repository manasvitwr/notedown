# notedown

> paste anything. keep it as portable markdown.

a local-first capture stream for turning messy paste into self-contained markdown files.

## what is notedown?

notedown is a minimal markdown capture tool for dumping research, transcripts, code, links, notes, and screenshots into one portable file.

it is built for the moment before organization – when you are collecting things fast and don’t want folders, databases, tags, or cloud storage getting in the way.

paste whatever is on your clipboard. notedown timestamps it, formats it, compresses images when needed, and appends everything to a continuous markdown stream.

when you’re done, export a single `.nd.md` file.

no broken image paths. no asset folders. no cloud lock-in.

## why it exists

most note-taking tools are either too heavy or too fragile.

heavy tools are great for structured work, but slow when you just need to capture things quickly. scratchpads are fast, but pasted screenshots and references often become messy, external, or easy to lose.

notedown sits in between.

it is not a second brain, a notion clone, or an ai notes app. it is a fast capture layer for people who paste before they organize.

## core features

- append-only capture stream
- timestamped blocks for every paste
- support for text, links, code, transcripts, and screenshots
- in-browser image compression using canvas
- self-contained markdown export
- base64 image references stored at the bottom of the file
- markdown, preview, and data views
- live outline and capture stack
- local autosave with indexeddb
- no backend required

## how it works

1. paste content into notedown (use `Ctrl+V` or `Cmd+V`)
2. the app reads the clipboard contents
3. text is classified as prose, code, link, or transcript
4. images are resized and compressed in the browser
5. each item becomes a timestamped block
6. the document is autosaved locally
7. the full stream can be exported as one `.nd.md` file

## file format

notedown exports valid markdown with a `.nd.md` extension.

the file has three parts:

1. frontmatter for document metadata
2. readable markdown blocks
3. a data section for inline image references

image data is stored at the bottom of the file as markdown reference definitions, so the main note stays readable while the file remains portable.

---

## example exported `.nd.md` snippet

```markdown
---
notedown: 1
title: "compiler research dump"
created: "2026-08-21T02:40:00+05:30"
updated: "2026-08-21T02:45:00+05:30"
storage: "inline"
image_max_width: 1200
image_quality: 0.72
---

# compiler research dump

<!-- nd:block b_001 code 2026-08-21T02:41:00+05:30 -->
## 02:41 · code

```typescript
function parseToken(input: string): Token {
  return { type: "identifier", value: input.trim() };
}
```

<!-- nd:endblock b_001 -->

<!-- nd:block b_002 image 2026-08-21T02:42:00+05:30 -->
## 02:42 · screenshot

![screenshot][img_001]

<!-- nd:endblock b_002 -->

<!-- nd:data -->

[img_001]: data:image/webp;base64,UklGRi4AAABXRUJQVlA4ICIAAAAwBAC...

<!-- nd:enddata -->
```

> **Note on Compatibility**: If you open an `.nd.md` file in any generic markdown editor, the body text and images render seamlessly. The HTML block comments are ignored by standard parsers.

---

### prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm` or `pnpm`

### installation

```bash
# Clone the repository
git clone https://github.com/your-username/notedown.git

# Navigate into the project directory
cd notedown

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### building for production

```bash
# Type check and build static bundle
npm run build

# Preview production build locally
npm run preview
```

---


## known limitations

- **Large File Sizes**: Embedding 50+ high-resolution screenshots into a single `.nd.md` file as base64 can lead to file sizes of 10MB–20MB+. Use the built-in **Portable Score** indicator in the status bar to monitor document weight.
- **Plain Text Editing**: Version 1 uses a native `<textarea>` for standard markdown editing rather than a full rich-text rich-editor like CodeMirror. CodeMirror editor integration is planned for v1.5.

---
**made w 🤍 by manasvi**
