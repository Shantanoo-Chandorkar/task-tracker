/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
        return [
            {
                // Must never be cached - a stale cached copy means the browser's own
                // byte-comparison update check silently never sees a new version.
                source: '/sw.js',
                headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
            },
        ];
    },
};

export default nextConfig;
