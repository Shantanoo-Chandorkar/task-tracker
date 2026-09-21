import { describe, expect, it } from 'vitest';
import { sanitizeString, checkMaxLength, sanitizeRichText } from './validation';

describe('sanitizeString', () => {
    it('trims whitespace', () => {
        expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('strips HTML tags by default', () => {
        expect(sanitizeString('<b>hi</b>')).toBe('hi');
    });

    it('keeps HTML tags when shouldStripTags is false', () => {
        expect(sanitizeString('<b>hi</b>', false)).toBe('<b>hi</b>');
    });

    it('returns an empty string for non-string input', () => {
        expect(sanitizeString(null)).toBe('');
        expect(sanitizeString(undefined)).toBe('');
        expect(sanitizeString(42)).toBe('');
        expect(sanitizeString({})).toBe('');
    });

    it('returns an empty string for whitespace-only input', () => {
        expect(sanitizeString('   \n\t ')).toBe('');
    });

    it('leaves no tag behind when tags are nested to survive a single strip pass', () => {
        expect(sanitizeString('<<b>script>alert(1)<</b>/script>')).not.toMatch(/<\s*\/?\s*script/i);
    });
});

describe('checkMaxLength', () => {
    it('returns null when within the limit', () => {
        expect(checkMaxLength('abc', 5, 'Name')).toBeNull();
    });

    it('returns an error object when over the limit', () => {
        expect(checkMaxLength('abcdef', 5, 'Name')).toEqual({
            error: 'Name cannot exceed 5 characters.',
            code: 'INPUT_TOO_LONG',
        });
    });

    it('accepts text exactly at the limit', () => {
        expect(checkMaxLength('abcde', 5, 'Name')).toBeNull();
    });

    it('rejects text one character over the limit', () => {
        expect(checkMaxLength('abcdef', 5, 'Name')).not.toBeNull();
    });

    it('returns the caller-supplied error code', () => {
        expect(checkMaxLength('abcdef', 5, 'Title', 'TITLE_TOO_LONG').code).toBe('TITLE_TOO_LONG');
    });

    it('names the offending field in the message', () => {
        expect(checkMaxLength('abcdef', 5, 'Task title').error).toContain('Task title');
    });

    it('skips the check for non-string input', () => {
        expect(checkMaxLength(null, 5, 'Name')).toBeNull();
        expect(checkMaxLength(undefined, 5, 'Name')).toBeNull();
    });
});

const ALLOWED_TAG_NAMES = new Set(['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 's', 'strike', 'del']);
const ALLOWED_ATTRIBUTE_NAMES = new Set(['href', 'rel', 'target']);
const EXECUTABLE_URL_SCHEME = /^(javascript|data|vbscript):/;

/**
 * Parses sanitized output like a browser would and lists anything that could execute script.
 *
 * @param {string} sanitizedHtml - Output of sanitizeRichText.
 * @returns {string[]} Human-readable findings; empty when the markup is safe.
 */
function findUnsafeMarkup(sanitizedHtml) {
    const parsedContainer = document.createElement('div');
    parsedContainer.innerHTML = sanitizedHtml;

    const unsafeFindings = [];
    for (const element of parsedContainer.querySelectorAll('*')) {
        const tagName = element.tagName.toLowerCase();
        if (!ALLOWED_TAG_NAMES.has(tagName)) unsafeFindings.push(`tag <${tagName}>`);

        for (const attribute of element.attributes) {
            if (!ALLOWED_ATTRIBUTE_NAMES.has(attribute.name)) unsafeFindings.push(`attribute ${attribute.name}`);
        }

        // Browsers ignore tabs, newlines and spaces inside a scheme, so compare with them removed
        const normalizedHref = (element.getAttribute('href') ?? '').replace(/[\u0000- ]/g, '').toLowerCase();
        if (EXECUTABLE_URL_SCHEME.test(normalizedHref)) unsafeFindings.push(`href ${normalizedHref}`);
    }
    return unsafeFindings;
}

describe('sanitizeRichText', () => {
    it('allows the configured formatting tags', () => {
        expect(sanitizeRichText('<p><b>bold</b> and <i>italic</i></p>')).toBe(
            '<p><b>bold</b> and <i>italic</i></p>',
        );
    });

    it('strips disallowed tags and attributes', () => {
        expect(sanitizeRichText('<script>alert(1)</script><p onclick="x()">hi</p>')).toBe('<p>hi</p>');
    });

    it('forces rel="noopener noreferrer" on target="_blank" links even if omitted', () => {
        const sanitizedLinkHtml = sanitizeRichText('<a href="https://example.com" target="_blank">link</a>');
        expect(sanitizedLinkHtml).toContain('rel="noopener noreferrer"');
    });

    it('returns an empty string for non-string input', () => {
        expect(sanitizeRichText(null)).toBe('');
        expect(sanitizeRichText(undefined)).toBe('');
        expect(sanitizeRichText(42)).toBe('');
        expect(sanitizeRichText('')).toBe('');
    });

    it('keeps ordinary http, https and mailto links', () => {
        const sanitizedLinksHtml = sanitizeRichText(
            '<a href="https://example.com">a</a><a href="http://example.com">b</a><a href="mailto:x@example.com">c</a>',
        );
        expect(sanitizedLinksHtml).toContain('href="https://example.com"');
        expect(sanitizedLinksHtml).toContain('href="http://example.com"');
        expect(sanitizedLinksHtml).toContain('href="mailto:x@example.com"');
    });

    it('overwrites an attacker-supplied rel on target="_blank" links', () => {
        const sanitizedLinkHtml = sanitizeRichText('<a href="https://example.com" target="_blank" rel="opener">x</a>');
        expect(sanitizedLinkHtml).toContain('rel="noopener noreferrer"');
        expect(sanitizedLinkHtml).not.toContain('rel="opener"');
    });

    it('drops style and class attributes from allowed tags', () => {
        expect(sanitizeRichText('<p style="position:fixed" class="x">hi</p>')).toBe('<p>hi</p>');
    });
});

describe('sanitizeRichText XSS payloads', () => {
    const xssPayloads = {
        'script tag': '<script>alert(1)</script>',
        'script inside an allowed tag': '<p><script>alert(1)</script></p>',
        'img onerror': '<img src=x onerror=alert(1)>',
        'svg onload': '<svg onload=alert(1)>',
        'iframe javascript src': '<iframe src="javascript:alert(1)"></iframe>',
        'object data': '<object data="javascript:alert(1)"></object>',
        embed: '<embed src="javascript:alert(1)">',
        'form action': '<form action="javascript:alert(1)"><button>x</button></form>',
        'meta refresh': '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
        'base href': '<base href="javascript:alert(1)//">',
        'link import': '<link rel="stylesheet" href="javascript:alert(1)">',
        'style block': '<style>@import "javascript:alert(1)";</style>',
        textarea: '<textarea><script>alert(1)</script></textarea>',
        template: '<template><script>alert(1)</script></template>',
        'html comment wrapper': '<!--><script>alert(1)</script>-->',
        'javascript href': '<a href="javascript:alert(1)">x</a>',
        'mixed-case javascript href': '<a href="JaVaScRiPt:alert(1)">x</a>',
        'leading-space javascript href': '<a href=" javascript:alert(1)">x</a>',
        'tab inside javascript scheme': '<a href="jav&#x09;ascript:alert(1)">x</a>',
        'newline inside javascript scheme': '<a href="java&#x0A;script:alert(1)">x</a>',
        'decimal-entity javascript href': '<a href="&#106;avascript:alert(1)">x</a>',
        'hex-entity javascript href': '<a href="&#x6A;avascript:alert(1)">x</a>',
        'data html href': '<a href="data:text/html,<script>alert(1)</script>">x</a>',
        'base64 data href': '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
        'vbscript href': '<a href="vbscript:msgbox(1)">x</a>',
        'onclick on allowed tag': '<p onclick="alert(1)">x</p>',
        'onmouseover on bold': '<b onmouseover=alert(1)>x</b>',
        'onclick on a valid link': '<a href="https://example.com" onclick="alert(1)">x</a>',
        'quote-breaking attribute': '<a href="https://example.com" title="x" onfocus="alert(1)" autofocus="">x</a>',
        'unclosed tag swallowing a script': '<a<script>alert(1)</script>>x</a>',
        'unclosed anchor': '<a href="javascript:alert(1)"',
        'svg style mutation': '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
        'math mglyph mutation':
            '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">',
        'noscript mutation': '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
        'nested tags to survive a strip pass': '<scr<script>ipt>alert(1)</scr</script>ipt>',
    };

    it.each(Object.entries(xssPayloads))('neutralises %s', (payloadDescription, xssPayload) => {
        expect(findUnsafeMarkup(sanitizeRichText(xssPayload))).toEqual([]);
    });

    it.each(Object.entries(xssPayloads))('is idempotent for %s', (payloadDescription, xssPayload) => {
        const sanitizedOnce = sanitizeRichText(xssPayload);
        expect(sanitizeRichText(sanitizedOnce)).toBe(sanitizedOnce);
    });

    it('has a scanner that flags unsafe markup, so a clean result is meaningful', () => {
        expect(findUnsafeMarkup('<img src=x onerror=alert(1)>')).not.toEqual([]);
        expect(findUnsafeMarkup('<a href=" JaVa\tScript:alert(1)">x</a>')).not.toEqual([]);
        expect(findUnsafeMarkup('<p><b>fine</b></p>')).toEqual([]);
    });

    it('keeps the harmless text of a stripped payload, not the executable part', () => {
        expect(sanitizeRichText('<p>before</p><script>alert(1)</script><p>after</p>')).toBe('<p>before</p><p>after</p>');
    });
});
