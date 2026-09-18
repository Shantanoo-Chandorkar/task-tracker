'use client';

import { useEffect, useRef, useState } from 'react';
import { useNavigationProgress } from '@/hooks/useNavigationProgress';

/**
 * Thin top-of-page bar that sweeps toward 90% during a navigation and never completes on its own.
 */
export default function NavigationProgressBar() {
    const isLoading = useNavigationProgress();
    const [progress, setProgress] = useState(0);
    const [lastIsLoading, setLastIsLoading] = useState(isLoading);
    const rafRef = useRef(null);

    // Adjusted during render, not an effect - see TaskFormDialog's resetKey pattern.
    if (isLoading !== lastIsLoading) {
        setLastIsLoading(isLoading);
        if (isLoading) {
            setProgress(progress === 0 || progress === 100 ? 8 : progress);
        } else {
            setProgress(progress > 0 ? 100 : 0);
        }
    }

    // The rAF sweep and the reset-to-zero timeout are genuinely external-timer-driven,
    // not synchronous state derived from a prop - a real effect, not a render adjustment.
    useEffect(() => {
        if (isLoading) {
            function advance() {
                setProgress((current) =>
                    current < 90 ? current + (90 - current) * 0.05 : current,
                );
                rafRef.current = requestAnimationFrame(advance);
            }
            rafRef.current = requestAnimationFrame(advance);
            return () => {
                if (rafRef.current) cancelAnimationFrame(rafRef.current);
            };
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        const resetTimeout = setTimeout(() => setProgress(0), 400);
        return () => clearTimeout(resetTimeout);
    }, [isLoading]);

    const isHidden = progress === 0;

    return (
        <div
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-hidden={isHidden}
            className="fixed top-0 left-0 w-full h-[3px] z-50 pointer-events-none"
        >
            <div
                className="h-full bg-primary"
                style={{
                    width: `${progress}%`,
                    opacity: isHidden ? 0 : 1,
                    transition: 'width 0.2s ease, opacity 0.3s ease',
                }}
            />
        </div>
    );
}
