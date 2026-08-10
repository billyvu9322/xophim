// HLS ad-marker + ad-segment cleanup. Network-free pure transform: given a
// MEDIA playlist (segment list) it removes injected ad segments and returns the
// content playlist with absolute segment URLs. KKPhim splices ads two ways:
//   1) marker breaks — #EXT-X-CUE-OUT / SCTE35 / interstitial DATERANGE, and
//   2) UNMARKED segments whose URL lives in a different directory than the
//      playlist itself (e.g. /v8/<hash>/segment_NNNN.ts or convertv8/x.ts),
//      bracketed by #EXT-X-DISCONTINUITY and an injected #EXT-X-KEY:METHOD=NONE.
// The directory heuristic catches the unmarked mid-roll ads the markers miss.

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

// Directory (origin + path without the trailing filename) of an absolute URL.
function dirOfUrl(u: string): string | null {
  try {
    const url = new URL(u);
    return url.origin + url.pathname.replace(/[^/]*$/, "");
  } catch {
    return null;
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
    (upper.includes("COM.APPLE.HLS.INTERSTITIAL") || upper.includes('CLASS="AD'))
  );
}

export function cleanupHlsPlaylist(playlist: string, playlistUrl: string): string {
  const lines = playlist.split(/\r?\n/);
  // Master playlists reference variant playlists that legitimately live in
  // subdirectories, so the directory heuristic must NOT run on them.
  const isMaster = lines.some((l) =>
    l.trim().toUpperCase().startsWith("#EXT-X-STREAM-INF"),
  );
  const baseDir = dirOfUrl(playlistUrl);

  const output: string[] = [];
  let inAdBreak = false;
  let pendingSegmentTags: string[] = [];
  // We collapse every removed ad splice into exactly ONE discontinuity before
  // the next kept segment. Dropping discontinuities entirely breaks playback:
  // the content on each side of a removed ad has a PTS reset, so hls.js stalls
  // (endless re-fetch of the same segment, no seeking) unless a discontinuity
  // tells it to reset the timeline. Leading/trailing ones are still dropped.
  let pendingDiscontinuity = false;
  let emittedSegment = false;

  const dropAd = () => {
    pendingSegmentTags = [];
    pendingDiscontinuity = true;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1) Explicit marker ad breaks.
    if (isCueOut(line)) {
      inAdBreak = true;
      pendingSegmentTags = [];
      continue;
    }
    if (isCueIn(line)) {
      inAdBreak = false;
      pendingSegmentTags = [];
      pendingDiscontinuity = true;
      continue;
    }
    if (isInterstitialDateRange(line)) continue;

    // 2) Buffer discontinuities — emit at most one at each content junction.
    if (line.toUpperCase().startsWith("#EXT-X-DISCONTINUITY")) {
      pendingDiscontinuity = true;
      pendingSegmentTags = [];
      continue;
    }

    // 3) Drop the key line ads inject to disable encryption for their segments.
    // Real content keys use a method (AES-128 etc.) and are preserved.
    if (line.toUpperCase().startsWith("#EXT-X-KEY") && /METHOD=NONE/i.test(line)) {
      continue;
    }

    if (isUriLine(line)) {
      if (inAdBreak) {
        dropAd();
        continue;
      }
      // 4) Unmarked ad: a media-playlist segment whose directory differs from
      // the playlist's own directory was injected by the ad server.
      const resolved = resolveUri(line, playlistUrl);
      if (!isMaster && baseDir) {
        const segDir = dirOfUrl(resolved);
        if (segDir && segDir !== baseDir) {
          dropAd();
          continue;
        }
      }
      // Kept segment — emit a single discontinuity if an ad was removed since
      // the previous kept segment (never leading, never trailing).
      if (pendingDiscontinuity && emittedSegment) {
        output.push("#EXT-X-DISCONTINUITY");
      }
      pendingDiscontinuity = false;
      output.push(...pendingSegmentTags, resolved);
      pendingSegmentTags = [];
      emittedSegment = true;
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

// Extract the first variant playlist URI from a master playlist, or null if the
// given playlist is already a media (segment) playlist.
export function firstVariantUri(playlist: string): string | null {
  const lines = playlist.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim().toUpperCase().startsWith("#EXT-X-STREAM-INF")) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]?.trim();
        if (next && !next.startsWith("#")) return next;
      }
    }
  }
  return null;
}
