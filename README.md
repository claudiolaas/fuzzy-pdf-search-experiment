# Fuzzy PDF Search Experiment

Find and highlight text in PDFs with tolerance for minor deviations like line breaks, extra whitespace, and hidden characters.

## The Problem

PDF text extraction often produces text that doesn't exactly match what you're searching for:
- Line breaks in the middle of words
- Extra whitespace or soft hyphens
- OCR artifacts
- Text spanning multiple layout elements

Traditional exact-match search fails in these cases.

## The Solution

Instead of fuzzy/semantic search, this uses **wildcard regex injection** — the query is nearly exact, just tolerant of small deviations:

```
Query:   "total assets"
Pattern: \bt.?o.?t.?a.?l\s+a.?s.?s.?e.?t.?s\b
```

The `.?` allows zero or one character between each letter, handling hidden characters. Word boundaries (`\b`) prevent matching substrings inside unrelated words.

## Demo

1. Clone and serve locally:
   ```bash
   git clone https://github.com/claudiolaas/fuzzy-pdf-search-experiment.git
   cd fuzzy-pdf-search-experiment
   python3 -m http.server 8080
   ```

2. Open http://localhost:8080

3. Load a PDF and search

## Features

- **4 search modes:**
  - `whitespace-only` — only tolerates whitespace variations
  - `intra-word` — `.?` within words, `\s+` between (recommended)
  - `intra-word-hyphen` — also handles soft hyphens
  - `full` — maximum tolerance everywhere

- **Word boundaries** — won't match "USA" inside "Aussagen"

- **Multi-page search** — searches all pages, navigates to first match

- **Overlay highlighting** — doesn't modify the text layer, positions highlight rectangles based on actual rendered text

## API

```javascript
import { buildFlexiblePattern, buildSearchableText, findMatch } from './fuzzy-search.js';

// Generate regex pattern
const pattern = buildFlexiblePattern('search query', {
  mode: 'intra-word',  // pattern mode
  wholeWord: true      // add word boundaries (default)
});

// Build searchable text from PDF.js text items
const { pageText, itemRanges } = buildSearchableText(textContent.items);

// Find match
const match = findMatch(pageText, 'search query', { mode: 'intra-word' });
// → { matchedText: '...', start: 0, end: 10 }
```

## Tests

```bash
node test.js
```

## How It Works

1. **Pattern Generation** — `buildFlexiblePattern()` converts query to tolerant regex
2. **Text Extraction** — `buildSearchableText()` concatenates PDF text items with position tracking
3. **Matching** — Standard regex exec against the extracted text
4. **Position Mapping** — `matchToItemSegments()` maps match positions back to original text items
5. **Highlighting** — Overlay divs positioned using text item transforms

## Dependencies

- [PDF.js](https://mozilla.github.io/pdf.js/) (loaded from CDN)

## License

MIT
