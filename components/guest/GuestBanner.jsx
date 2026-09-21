'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCurrentUserProfileQuery } from '@/hooks/useCurrentUserProfileQuery';
import { formatSecondsAsClock } from '@/lib/guest/guest-session';

const BANNER_HEIGHT_CSS_VARIABLE = '--guest-banner-height';
const EXPIRED_LOGIN_URL = '/login?reason=guest-expired';
const WARNING_SECONDS = 120;

/**
 * Persistent notice shown to guests only: what guest mode is, a live countdown, and a way to sign up.
 * At 0:00 it sends the browser to the login page, where the proxy ends the session.
 *
 * @returns {JSX.Element|null} Null for registered users and while the profile is still loading.
 */
export default function GuestBanner() {
    const { data: profile, dataUpdatedAt } = useCurrentUserProfileQuery();
    const bannerRef = useRef(null);
    const hasRedirectedRef = useRef(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const isGuest = profile?.is_guest === true;

    useEffect(() => {
        if (!isGuest) return undefined;
        const tickIntervalId = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(tickIntervalId);
    }, [isGuest]);

    // The seconds left come from the server at fetch time, so the browser clock cannot make the countdown wrong
    const secondsLeft = isGuest ? Math.max(0, profile.guest_seconds_left - Math.floor((nowMs - dataUpdatedAt) / 1000)) : null;

    useEffect(() => {
        if (secondsLeft === 0 && !hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            window.location.assign(EXPIRED_LOGIN_URL);
        }
    }, [secondsLeft]);

    // The sticky mobile top bar sits below this banner, so it needs to know how tall the banner is
    useEffect(() => {
        const bannerElement = bannerRef.current;
        if (!isGuest || !bannerElement) return undefined;

        const publishHeight = () =>
            document.documentElement.style.setProperty(BANNER_HEIGHT_CSS_VARIABLE, `${bannerElement.offsetHeight}px`);
        publishHeight();
        const resizeObserver = new ResizeObserver(publishHeight);
        resizeObserver.observe(bannerElement);

        return () => {
            resizeObserver.disconnect();
            document.documentElement.style.removeProperty(BANNER_HEIGHT_CSS_VARIABLE);
        };
    }, [isGuest]);

    if (!isGuest) return null;

    const isRunningOut = secondsLeft <= WARNING_SECONDS;

    return (
        <div
            ref={bannerRef}
            role="region"
            aria-label="Guest mode"
            className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-foreground"
        >
            <p className="min-w-0 flex-1 basis-56">
                <strong className="font-semibold">Guest mode.</strong> Do not add sensitive information: everything is
                deleted when this session ends.
            </p>
            <div className="flex flex-shrink-0 items-center gap-3">
                <span
                    className={`font-mono tabular-nums ${isRunningOut ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}
                >
                    {formatSecondsAsClock(secondsLeft)} left
                </span>
                <Link href="/signup" className="font-medium underline underline-offset-4">
                    Sign up
                </Link>
            </div>
        </div>
    );
}
