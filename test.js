/**
 * Unit tests for fuzzy-search.js
 * Run with: node test.js
 */

const {
  escapeRegex,
  buildFlexiblePattern,
  buildSearchableText,
  matchToItemSegments,
  findMatch,
  findAllMatches
} = require('./fuzzy-search.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg = '') {
  if (!value) {
    throw new Error(`Expected truthy value. ${msg}`);
  }
}

function assertMatch(text, pattern, flags = 'i') {
  const regex = new RegExp(pattern, flags);
  if (!regex.test(text)) {
    throw new Error(`Pattern did not match.\nText: "${text}"\nPattern: ${pattern}`);
  }
}

function assertNoMatch(text, pattern, flags = 'i') {
  const regex = new RegExp(pattern, flags);
  if (regex.test(text)) {
    throw new Error(`Pattern should NOT match.\nText: "${text}"\nPattern: ${pattern}`);
  }
}

console.log('\n=== escapeRegex tests ===\n');

test('escapeRegex: escapes special characters', () => {
  assertEqual(escapeRegex('a.b'), 'a\\.b');
  assertEqual(escapeRegex('a*b'), 'a\\*b');
  assertEqual(escapeRegex('a+b'), 'a\\+b');
  assertEqual(escapeRegex('a?b'), 'a\\?b');
  assertEqual(escapeRegex('a^b'), 'a\\^b');
  assertEqual(escapeRegex('a$b'), 'a\\$b');
  assertEqual(escapeRegex('a[b]'), 'a\\[b\\]');
  assertEqual(escapeRegex('a(b)'), 'a\\(b\\)');
  assertEqual(escapeRegex('a{b}'), 'a\\{b\\}');
  assertEqual(escapeRegex('a|b'), 'a\\|b');
  assertEqual(escapeRegex('a\\b'), 'a\\\\b');
});

test('escapeRegex: leaves normal characters unchanged', () => {
  assertEqual(escapeRegex('hello'), 'hello');
  assertEqual(escapeRegex('Hello World'), 'Hello World');
});

console.log('\n=== buildFlexiblePattern tests ===\n');

test('buildFlexiblePattern: whitespace-only mode', () => {
  const pattern = buildFlexiblePattern('hello world', { mode: 'whitespace-only', wholeWord: false });
  assertEqual(pattern, 'hello\\s+world');
});

test('buildFlexiblePattern: intra-word mode', () => {
  const pattern = buildFlexiblePattern('ab cd', { mode: 'intra-word', wholeWord: false });
  assertEqual(pattern, 'a.?b\\s+c.?d');
});

test('buildFlexiblePattern: full mode', () => {
  const pattern = buildFlexiblePattern('ab cd', { mode: 'full', wholeWord: false });
  assertEqual(pattern, 'a.?b.?\\s*.?c.?d');
});

test('buildFlexiblePattern: whole word boundaries (default)', () => {
  const pattern = buildFlexiblePattern('usa', { mode: 'intra-word' });
  assertEqual(pattern, '\\bu.?s.?a\\b');
});

test('buildFlexiblePattern: escapes special characters', () => {
  const pattern = buildFlexiblePattern('a.b', { mode: 'intra-word' });
  assertTrue(pattern.includes('\\.'), 'Should escape dot');
});

test('buildFlexiblePattern: handles Unicode', () => {
  // Note: \b doesn't work well with Unicode, so test without word boundaries
  const pattern = buildFlexiblePattern('café', { mode: 'intra-word', wholeWord: false });
  assertMatch('café', pattern);
});

test('buildFlexiblePattern: rejects empty query', () => {
  let threw = false;
  try {
    buildFlexiblePattern('');
  } catch (e) {
    threw = true;
  }
  assertTrue(threw, 'Should throw for empty query');
});

console.log('\n=== Pattern matching tests ===\n');

test('Pattern matches exact text', () => {
  const pattern = buildFlexiblePattern('total assets', { mode: 'intra-word' });
  assertMatch('total assets', pattern);
});

test('Pattern matches with different case', () => {
  const pattern = buildFlexiblePattern('total assets', { mode: 'intra-word' });
  assertMatch('Total Assets', pattern);
  assertMatch('TOTAL ASSETS', pattern);
});

test('Pattern matches with line break', () => {
  const pattern = buildFlexiblePattern('total assets', { mode: 'intra-word' });
  assertMatch('total\nassets', pattern);
  assertMatch('total\r\nassets', pattern);
});

test('Pattern matches with extra spaces', () => {
  const pattern = buildFlexiblePattern('total assets', { mode: 'intra-word' });
  assertMatch('total  assets', pattern);
  assertMatch('total   assets', pattern);
});

test('Pattern matches with hidden characters', () => {
  const pattern = buildFlexiblePattern('apple', { mode: 'intra-word' });
  assertMatch('a\u200Bpple', pattern); // zero-width space
  assertMatch('ap\u00ADple', pattern); // soft hyphen
});

test('Pattern handles hyphenated words', () => {
  const pattern = buildFlexiblePattern('international', { mode: 'intra-word-hyphen' });
  assertMatch('inter-\nnational', pattern);
  assertMatch('inter-national', pattern);
  assertMatch('international', pattern);
});

test('Pattern: whitespace-only does not match hidden chars', () => {
  const pattern = buildFlexiblePattern('apple', { mode: 'whitespace-only' });
  assertNoMatch('a\u200Bpple', pattern); // Should NOT match - no flexibility within words
});

console.log('\n=== buildSearchableText tests ===\n');

test('buildSearchableText: builds text and ranges', () => {
  const items = [
    { str: 'Hello' },
    { str: 'World' }
  ];
  const { pageText, itemRanges } = buildSearchableText(items);

  assertEqual(pageText, 'Hello World');
  assertEqual(itemRanges.length, 2);
  assertEqual(itemRanges[0].start, 0);
  assertEqual(itemRanges[0].end, 5);
  assertEqual(itemRanges[1].start, 6);
  assertEqual(itemRanges[1].end, 11);
});

test('buildSearchableText: handles empty items', () => {
  const items = [
    { str: '' },
    { str: 'test' }
  ];
  const { pageText } = buildSearchableText(items);
  assertTrue(pageText.includes('test'));
});

console.log('\n=== matchToItemSegments tests ===\n');

test('matchToItemSegments: single item match', () => {
  const itemRanges = [
    { itemIndex: 0, start: 0, end: 5, text: 'Hello' }
  ];
  const segments = matchToItemSegments(itemRanges, 1, 4);

  assertEqual(segments.length, 1);
  assertEqual(segments[0].itemIndex, 0);
  assertEqual(segments[0].startInItem, 1);
  assertEqual(segments[0].endInItem, 4);
});

test('matchToItemSegments: match spanning multiple items', () => {
  const itemRanges = [
    { itemIndex: 0, start: 0, end: 5, text: 'Hello' },
    { itemIndex: 1, start: 6, end: 11, text: 'World' }
  ];
  // Match "lo Wo" (positions 3-9)
  const segments = matchToItemSegments(itemRanges, 3, 9);

  assertEqual(segments.length, 2);
  assertEqual(segments[0].itemIndex, 0);
  assertEqual(segments[0].startInItem, 3);
  assertEqual(segments[0].endInItem, 5);
  assertEqual(segments[1].itemIndex, 1);
  assertEqual(segments[1].startInItem, 0);
  assertEqual(segments[1].endInItem, 3);
});

test('matchToItemSegments: no overlap', () => {
  const itemRanges = [
    { itemIndex: 0, start: 0, end: 5, text: 'Hello' }
  ];
  const segments = matchToItemSegments(itemRanges, 10, 15);
  assertEqual(segments.length, 0);
});

console.log('\n=== findMatch tests ===\n');

test('findMatch: finds basic match', () => {
  const match = findMatch('Hello World', 'hello', { mode: 'intra-word' });
  assertTrue(match !== null);
  assertEqual(match.matchedText, 'Hello');
  assertEqual(match.start, 0);
  assertEqual(match.end, 5);
});

test('findMatch: returns null for no match', () => {
  const match = findMatch('Hello World', 'xyz', { mode: 'intra-word' });
  assertTrue(match === null);
});

test('findMatch: handles cross-line text', () => {
  const match = findMatch('total\nassets', 'total assets', { mode: 'intra-word' });
  assertTrue(match !== null);
  assertEqual(match.matchedText, 'total\nassets');
});

console.log('\n=== findAllMatches tests ===\n');

test('findAllMatches: finds multiple matches', () => {
  const matches = findAllMatches('apple banana apple', 'apple', { mode: 'intra-word' });
  assertEqual(matches.length, 2);
  assertEqual(matches[0].start, 0);
  assertEqual(matches[1].start, 13); // "apple banana apple" - second apple at position 13
});

test('findAllMatches: returns empty array for no matches', () => {
  const matches = findAllMatches('hello world', 'xyz', { mode: 'intra-word' });
  assertEqual(matches.length, 0);
});

// Summary
console.log('\n=== Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
