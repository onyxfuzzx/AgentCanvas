export type Rect = { x: number; y: number; width: number; height: number };

export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Keep full page dimensions; native clipping removes the occluded pixels. */
export function visibleRegions(
  bounds: Rect,
  canvas: Rect,
  occluders: Rect[],
): Rect[] {
  const visible = intersection(bounds, canvas);
  let regions = visible ? [visible] : [];
  for (const cover of occluders) {
    regions = regions.flatMap((r) => {
      const hit = intersection(r, cover);
      if (!hit) return [r];
      return [
        { x: r.x, y: r.y, width: r.width, height: hit.y - r.y },
        {
          x: r.x,
          y: hit.y + hit.height,
          width: r.width,
          height: r.y + r.height - hit.y - hit.height,
        },
        { x: r.x, y: hit.y, width: hit.x - r.x, height: hit.height },
        {
          x: hit.x + hit.width,
          y: hit.y,
          width: r.x + r.width - hit.x - hit.width,
          height: hit.height,
        },
      ].filter((part) => part.width > 0 && part.height > 0);
    });
    // Pathological overlap must fail closed rather than generate unbounded regions.
    if (regions.length > 256) return [];
  }
  return regions.map((r) => ({ ...r, x: r.x - bounds.x, y: r.y - bounds.y }));
}

export function browserUrl(input: string): string {
  const value = input.trim();
  if (
    !value ||
    value.length > 4096 ||
    Array.from(value).some(
      (c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127,
    ) ||
    value.includes('\\')
  )
    throw new Error('Enter an HTTP or HTTPS URL without spaces.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a full URL, such as https://example.com.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new Error(
      'Only HTTP and HTTPS pages without embedded credentials are supported.',
    );
  if (url.hostname.endsWith('.localhost'))
    throw new Error('App-internal addresses cannot be opened.');
  return url.href;
}
