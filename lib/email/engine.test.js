import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
    const sendMailMock = vi.fn();
    return { sendMailMock, createTransportMock: vi.fn(() => ({ sendMail: sendMailMock })) };
});

vi.mock('nodemailer', () => ({ default: { createTransport: createTransportMock } }));

import { escapeHtml, escapeUrl, sendEmail } from './engine';

describe('escapeHtml', () => {
    it.each([
        ['&', '&amp;'],
        ['<', '&lt;'],
        ['>', '&gt;'],
        ['"', '&quot;'],
        ["'", '&#39;'],
    ])('escapes %s', (character, escapedCharacter) => {
        expect(escapeHtml(character)).toBe(escapedCharacter);
    });

    it('neutralises a script tag', () => {
        expect(escapeHtml('<script>alert("x")</script>')).toBe(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
        );
    });

    it('escapes an already-escaped entity so it renders literally', () => {
        expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    });

    it('leaves plain text unchanged and handles an empty string', () => {
        expect(escapeHtml('Weekly review')).toBe('Weekly review');
        expect(escapeHtml('')).toBe('');
    });

    it('converts non-string input instead of throwing', () => {
        expect(escapeHtml(42)).toBe('42');
        expect(escapeHtml(null)).toBe('null');
    });
});

describe('escapeUrl', () => {
    it('escapes the ampersands between query params', () => {
        expect(escapeUrl('https://example.com/a?x=1&y=2')).toBe(
            'https://example.com/a?x=1&amp;y=2',
        );
    });

    it('cannot be used to break out of an href attribute', () => {
        expect(escapeUrl('https://example.com/" onclick="alert(1)')).not.toContain('"');
    });

    it.each([
        'javascript:alert(1)',
        'JaVa\tScript:alert(1)',
        ' javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        '/relative/path',
        '',
    ])('replaces the non-http(s) URL %j with #', (unsafeUrl) => {
        expect(escapeUrl(unsafeUrl)).toBe('#');
    });

    it('keeps http and https URLs', () => {
        expect(escapeUrl('https://example.com/reset')).toBe('https://example.com/reset');
        expect(escapeUrl('HTTP://example.com')).toBe('HTTP://example.com');
    });
});

describe('sendEmail', () => {
    const emailFields = {
        toEmail: 'reader@example.com',
        subject: 'Reset your password',
        plainTextBody: 'Reset: https://example.com/reset?token=SECRET_TOKEN',
        htmlBody: '<a href="https://example.com/reset?token=SECRET_TOKEN">Reset</a>',
    };

    beforeEach(() => {
        sendMailMock.mockReset();
        createTransportMock.mockClear();
        vi.stubEnv('BREVO_SMTP_HOST', 'smtp.example.com');
        vi.stubEnv('BREVO_SMTP_PORT', '587');
        vi.stubEnv('BREVO_SMTP_USER', 'smtp-user');
        vi.stubEnv('BREVO_SMTP_PASS', 'smtp-pass');
        vi.stubEnv('EMAIL_FROM', 'Task Tracker <no-reply@example.com>');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('returns success and maps the fields onto the SMTP message', async () => {
        sendMailMock.mockResolvedValue({});

        await expect(sendEmail(emailFields)).resolves.toEqual({ success: true, error: null });
        expect(sendMailMock).toHaveBeenCalledWith({
            from: 'Task Tracker <no-reply@example.com>',
            to: 'reader@example.com',
            subject: 'Reset your password',
            text: emailFields.plainTextBody,
            html: emailFields.htmlBody,
        });
    });

    it('uses an implicit-TLS connection only on port 465', async () => {
        sendMailMock.mockResolvedValue({});
        await sendEmail(emailFields);
        expect(createTransportMock.mock.calls[0][0].secure).toBe(false);

        vi.stubEnv('BREVO_SMTP_PORT', '465');
        await sendEmail(emailFields);
        expect(createTransportMock.mock.calls[1][0].secure).toBe(true);
    });

    it('returns a failure result instead of throwing when the SMTP send is rejected', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        sendMailMock.mockRejectedValue(new Error('connection refused'));

        await expect(sendEmail(emailFields)).resolves.toEqual({
            success: false,
            error: 'connection refused',
        });
    });

    it('reports an unknown error when the rejection carries no message', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        sendMailMock.mockRejectedValue(undefined);

        await expect(sendEmail(emailFields)).resolves.toEqual({
            success: false,
            error: 'Unknown error',
        });
    });

    it('never writes the message body, and so the reset link, to the error log', async () => {
        const errorLogSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        sendMailMock.mockRejectedValue(new Error('boom'));

        await sendEmail(emailFields);

        expect(errorLogSpy).toHaveBeenCalled();
        expect(JSON.stringify(errorLogSpy.mock.calls)).not.toContain('SECRET_TOKEN');
        expect(JSON.stringify(errorLogSpy.mock.calls)).not.toContain('smtp-pass');
    });

    it('returns a failure result instead of throwing when the transport cannot be created', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        createTransportMock.mockImplementationOnce(() => {
            throw new Error('invalid SMTP config');
        });

        await expect(sendEmail(emailFields)).resolves.toMatchObject({ success: false });
    });
});
