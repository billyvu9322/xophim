function isUriLine(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed) && !trimmed.startsWith("#");
}

function resolveUri(line: string, playlistUrl: string): string {
  try {
    return new URL(line.trim(), playlistUrl).toString();
  } catch {
    return line.trim();
  }
}

function isCueOut(line: string): boolean {
  const upper = line.trim().toUpperCase();
  return upper.startsWith("#EXT-X-CUE-OUT") || upper.startsWith("#EXT-X-SCTE35");
}

function isCueIn(line: string): boolean {
  return line.trim().toUpperCase().startsWith("#EXT-X-CUE-IN");
}

function isInterstitialDateRange(line: string): boolean {
  const upper = line.trim().toUpperCase();
  return (
    upper.startsWith("#EXT-X-DATERANGE:") &&
    (upper.includes("COM.APPLE.HLS.INTERSTITIAL") || upper.includes("CLASS=\"AD"))
  );
}

export function cleanupHlsPlaylist(playlist: string, playlistUrl: string): string {
  const output: string[] = [];
  const lines = playlist.split(/\r?\n/);
  let inAdBreak = false;
  let pendingSegmentTags: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isCueOut(line)) {
      inAdBreak = true;
      pendingSegmentTags = [];
      continue;
    }

    if (isCueIn(line)) {
      inAdBreak = false;
      pendingSegmentTags = [];
      continue;
    }

    if (isInterstitialDateRange(line)) continue;
    if (inAdBreak) continue;

    if (isUriLine(line)) {
      output.push(...pendingSegmentTags, resolveUri(line, playlistUrl));
      pendingSegmentTags = [];
      continue;
    }

    if (line.startsWith("#EXTINF") || line.startsWith("#EXT-X-BYTERANGE")) {
      pendingSegmentTags.push(line);
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

export function isAllowedPlaylistHost(url: string, allowedHosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedHosts.some((allowedHost) => {
      const normalized = allowedHost.toLowerCase();
      return host === normalized || host.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}
