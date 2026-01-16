/**
 * PDF.js Wildcard Regex Search - Fuzzy Text Matching
 *
 * Finds and highlights text in PDFs with tolerance for:
 * - Line breaks and extra whitespace
 * - Soft hyphens and invisible characters
 * - Minor OCR artifacts
 */

/**
 * Escape regex special characters in a string
 * @param {string} str - Input string
 * @returns {string} - Escaped string safe for regex
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a flexible regex pattern from a plain text query
 *
 * @param {string} query - The search query
 * @param {Object} options - Configuration options
 * @param {string} options.mode - Pattern mode: 'whitespace-only' | 'intra-word' | 'full'
 * @param {boolean} options.caseInsensitive - Whether to ignore case (default: true)
 * @returns {string} - Regex pattern string
 *
 * Modes:
 * - whitespace-only: Only tolerates whitespace variations between words
 * - intra-word: Tolerates hidden chars within words + whitespace between (recommended)
 * - full: Maximum tolerance with optional chars everywhere
 */
function buildFlexiblePattern(query, options = {}) {
  const { mode = 'intra-word', wholeWord = true } = options;

  if (!query || typeof query !== 'string') {
    throw new Error('Query must be a non-empty string');
  }

  // Normalize Unicode (NFKC normalizes compatibility characters)
  const normalized = query.normalize('NFKC').trim();

  if (!normalized) {
    throw new Error('Query is empty after normalization');
  }

  // Split on whitespace to get word tokens
  const tokens = normalized.split(/\s+/);

  /**
   * Make a token flexible by inserting .? between characters
   * This allows zero or one "junk" character between each real character
   */
  const flexToken = (token) => {
    const chars = [...token]; // Handle Unicode properly
    return chars.map(c => escapeRegex(c)).join('.?');
  };

  /**
   * Handle hyphenation: allow optional soft hyphen or hyphen + whitespace
   * Pattern: (?:-\s*)?  allows "inter-\nnational" to match "international"
   */
  const flexTokenWithHyphen = (token) => {
    const chars = [...token];
    // Between each char, allow: .? OR (hyphen + optional whitespace)
    return chars.map(c => escapeRegex(c)).join('(?:-?\\s*)?(?:.?)');
  };

  let pattern;

  switch (mode) {
    case 'whitespace-only':
      // Simple: escape tokens, join with flexible whitespace
      pattern = tokens.map(escapeRegex).join('\\s+');
      break;

    case 'intra-word':
      // Recommended: .? within words, \s+ between words
      pattern = tokens.map(flexToken).join('\\s+');
      break;

    case 'intra-word-hyphen':
      // Like intra-word but also handles soft hyphens
      pattern = tokens.map(flexTokenWithHyphen).join('\\s+');
      break;

    case 'full':
      // Maximum tolerance: .? everywhere including word boundaries
      pattern = tokens.map(flexToken).join('.?\\s*.?');
      break;

    default:
      throw new Error(`Unknown mode: ${mode}`);
  }

  // Wrap with word boundaries to avoid matching substrings inside other words
  if (wholeWord) {
    pattern = '\\b' + pattern + '\\b';
  }

  return pattern;
}

/**
 * Build a searchable text string from PDF.js text content items
 * Also builds an index mapping character positions back to items
 *
 * @param {Array} items - Array of text items from page.getTextContent()
 * @returns {Object} - { pageText: string, itemRanges: Array }
 */
function buildSearchableText(items) {
  let pageText = '';
  const itemRanges = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const str = item.str || '';

    const start = pageText.length;
    pageText += str;
    const end = pageText.length;

    itemRanges.push({
      itemIndex: i,
      start,
      end,
      text: str
    });

    // Add a space between items as separator
    // This helps match text that spans multiple items
    if (i < items.length - 1 && str.length > 0) {
      pageText += ' ';
    }
  }

  return { pageText, itemRanges };
}

/**
 * Map a match position (start, end) back to PDF.js text item segments
 *
 * @param {Array} itemRanges - Array from buildSearchableText
 * @param {number} matchStart - Start index of match in pageText
 * @param {number} matchEnd - End index of match in pageText
 * @returns {Array} - Array of segments: { itemIndex, startInItem, endInItem, text }
 */
function matchToItemSegments(itemRanges, matchStart, matchEnd) {
  const segments = [];

  for (const range of itemRanges) {
    // Check if this item overlaps with the match
    if (range.start < matchEnd && range.end > matchStart) {
      // Calculate the overlap within this item
      const overlapStart = Math.max(range.start, matchStart);
      const overlapEnd = Math.min(range.end, matchEnd);

      // Convert to positions within the item's text
      const startInItem = overlapStart - range.start;
      const endInItem = overlapEnd - range.start;

      segments.push({
        itemIndex: range.itemIndex,
        startInItem,
        endInItem,
        text: range.text.slice(startInItem, endInItem)
      });
    }
  }

  return segments;
}

/**
 * Apply highlights to text layer spans
 *
 * @param {NodeList|Array} textLayerSpans - The span elements in the text layer
 * @param {Array} items - Original text items from getTextContent
 * @param {Array} segments - Segments from matchToItemSegments
 * @param {string} highlightClass - CSS class for highlights (default: 'fuzzy-highlight')
 */
function highlightSegments(textLayerSpans, items, segments, highlightClass = 'fuzzy-highlight') {
  // Build a map from itemIndex to span (handles sparse mapping when empty items are skipped)
  const spanByItemIndex = new Map();
  for (const span of textLayerSpans) {
    const idx = span.dataset?.itemIndex;
    if (idx !== undefined) {
      spanByItemIndex.set(parseInt(idx, 10), span);
    }
  }

  for (const seg of segments) {
    // Look up span by data-item-index attribute, fall back to array index
    const span = spanByItemIndex.get(seg.itemIndex) || textLayerSpans[seg.itemIndex];
    if (!span) continue;

    const text = items[seg.itemIndex].str || '';

    const before = text.slice(0, seg.startInItem);
    const mid = text.slice(seg.startInItem, seg.endInItem);
    const after = text.slice(seg.endInItem);

    // Clear existing content
    span.innerHTML = '';

    // Rebuild with highlight
    if (before) {
      span.appendChild(document.createTextNode(before));
    }

    if (mid) {
      const mark = document.createElement('mark');
      mark.className = highlightClass;
      mark.textContent = mid;
      span.appendChild(mark);
    }

    if (after) {
      span.appendChild(document.createTextNode(after));
    }
  }
}

/**
 * Clear all highlights from text layer spans
 *
 * @param {NodeList|Array} textLayerSpans - The span elements in the text layer
 * @param {Array} items - Original text items from getTextContent
 */
function clearHighlights(textLayerSpans, items) {
  for (const span of textLayerSpans) {
    const idx = span.dataset?.itemIndex;
    if (idx !== undefined) {
      const itemIndex = parseInt(idx, 10);
      const text = items[itemIndex]?.str || '';
      span.textContent = text;
    }
  }
}

/**
 * Main search function - finds and returns match info
 *
 * @param {string} pageText - Searchable text from buildSearchableText
 * @param {string} query - Search query
 * @param {Object} options - Options for buildFlexiblePattern
 * @returns {Object|null} - Match info or null if not found
 */
function findMatch(pageText, query, options = {}) {
  const { mode = 'intra-word', caseInsensitive = true } = options;

  try {
    const pattern = buildFlexiblePattern(query, { mode });
    const flags = caseInsensitive ? 'i' : '';
    const regex = new RegExp(pattern, flags);

    const match = regex.exec(pageText);

    if (match) {
      return {
        matchedText: match[0],
        start: match.index,
        end: match.index + match[0].length,
        pattern
      };
    }
  } catch (e) {
    console.error('Regex error:', e);
  }

  return null;
}

/**
 * Find all matches (not just the first one)
 *
 * @param {string} pageText - Searchable text
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Array} - Array of match objects
 */
function findAllMatches(pageText, query, options = {}) {
  const { mode = 'intra-word', caseInsensitive = true } = options;
  const matches = [];

  try {
    const pattern = buildFlexiblePattern(query, { mode });
    const flags = caseInsensitive ? 'gi' : 'g';
    const regex = new RegExp(pattern, flags);

    let match;
    while ((match = regex.exec(pageText)) !== null) {
      matches.push({
        matchedText: match[0],
        start: match.index,
        end: match.index + match[0].length
      });

      // Prevent infinite loops with zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  } catch (e) {
    console.error('Regex error:', e);
  }

  return matches;
}

/**
 * Main orchestration function - find and highlight text on a page
 *
 * @param {Object} page - PDF.js page object
 * @param {string} query - Search query
 * @param {HTMLElement} textLayerDiv - The text layer div element
 * @param {Object} options - Search options
 * @returns {Promise<Object|null>} - Match result or null
 */
async function findAndHighlight(page, query, textLayerDiv, options = {}) {
  // Get text content from page
  const textContent = await page.getTextContent();
  const items = textContent.items;

  // Build searchable text with position tracking
  const { pageText, itemRanges } = buildSearchableText(items);

  // Find the match
  const match = findMatch(pageText, query, options);

  if (!match) {
    return null;
  }

  // Map match to item segments
  const segments = matchToItemSegments(itemRanges, match.start, match.end);

  // Get text layer spans
  const textLayerSpans = textLayerDiv.querySelectorAll('span');

  // Apply highlights
  highlightSegments(textLayerSpans, items, segments, options.highlightClass);

  return {
    ...match,
    segments,
    pageText,
    itemRanges
  };
}

// Export for use as ES module or global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeRegex,
    buildFlexiblePattern,
    buildSearchableText,
    matchToItemSegments,
    highlightSegments,
    clearHighlights,
    findMatch,
    findAllMatches,
    findAndHighlight
  };
} else if (typeof window !== 'undefined') {
  window.FuzzyPDFSearch = {
    escapeRegex,
    buildFlexiblePattern,
    buildSearchableText,
    matchToItemSegments,
    highlightSegments,
    clearHighlights,
    findMatch,
    findAllMatches,
    findAndHighlight
  };
}
