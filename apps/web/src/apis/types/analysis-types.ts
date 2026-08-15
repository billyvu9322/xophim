export interface AnalysisSummary {
  totalUsers: number;
  activeSessions: number;
  usersWithHistory: number;
  totalProgressRows: number;
  totalWatchlistRows: number;
}

export interface AnalysisUser {
  id: string;
  username: string | null;
  email: string;
  role: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  activeSessions: number;
  lastLoginAt: string | null;
  lastUserAgent: string | null;
  lastIp: string | null;
  watchProgressCount: number;
  watchlistCount: number;
  lastWatchAt: string | null;
}

export interface AnalysisTopMovie {
  movieSlug: string;
  name: string;
  posterUrl: string;
  watchers: number;
  progressRows: number;
  lastWatchedAt: string;
}

export interface AnalysisRecentActivity {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  movieSlug: string;
  movieName: string;
  posterUrl: string;
  episodeSlug: string;
  serverName: string;
  positionSec: number;
  durationSec: number | null;
  updatedAt: string;
}

export interface AnalysisOverview {
  summary: AnalysisSummary;
  users: AnalysisUser[];
  topMovies: AnalysisTopMovie[];
  recentActivity: AnalysisRecentActivity[];
}
