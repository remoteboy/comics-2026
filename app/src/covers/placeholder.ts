export function coverPlaceholder(): Response {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#18181b"/><path d="M120 245h160v110H120z" fill="#27272a"/><path d="m145 330 45-45 35 35 25-25 25 35H145z" fill="#52525b"/><circle cx="245" cy="275" r="14" fill="#71717a"/><text x="200" y="390" fill="#71717a" font-family="system-ui,sans-serif" font-size="18" text-anchor="middle">Cover unavailable</text></svg>`;

  return new Response(svg, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'image/svg+xml',
    },
  });
}
