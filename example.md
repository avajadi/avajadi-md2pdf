# Avajadi document profile

This file exercises every element the template styles, and doubles as the smoke test.
Body text is IBM Plex Sans, headings are Space Grotesk, code is JetBrains Mono. Links
look like [this one](https://github.com/avajadi), and inline code like `md2pdf --rebuild`.

## Lists

- Charcoal and cream come from the panda logo
- Bamboo green is the single accent
  - used for H1 rules, H3 headings, links and code borders
  - and for list markers, like these
- Everything else stays neutral

1. Write Markdown
2. Run `md2pdf file.md`
3. Get `file.pdf` next to it

- [x] Fonts embedded
- [ ] Coffee

### A third-level heading

Term
: A definition list entry, which plain GFM doesn't have.

Another term
: Its definition.

#### Fourth level

##### Fifth level

###### Sixth level

## Tables

| Component | Role                          | Tech           |
|-----------|-------------------------------|----------------|
| Hub       | Wi-Fi access point and router | Raspberry Pi   |
| Server    | Forwards audio streams        | LiveKit        |
| App       | Listener and interpreter UI   | Flutter        |
| Mixer     | Floor plus questioner         | GStreamer      |

## Code

```bash
docker build -t avajadi-md2pdf:latest .
md2pdf example.md
```

> A blockquote, for notes and asides that deserve to stand apart from the text.

Some ~~struck~~ text, some **bold** and *italic*, and a footnote.[^1]

[^1]: Footnotes land at the end of the document in muted text.
