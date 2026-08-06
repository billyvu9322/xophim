// The single normalized shape returned to the web app. KKPhim quirks
// (relative image paths, dual response wrappers) never leak past the mapper.
export interface XoTaxonomy {
  name: string;
  slug: string;
}

export interface XoScore {
  imdb: number | null;
  tmdb: number | null;
}

export interface XoMovie {
  slug: string;
  name: string;
  originName: string;
  posterUrl: string;
  thumbUrl: string;
  type: string;
  year: number | null;
  quality: string;
  lang: string;
  episodeCurrent: string;
  categories: XoTaxonomy[];
  countries: XoTaxonomy[];
  score: XoScore;
}

export interface XoServerData {
  name: string;
  slug: string;
  linkEmbed: string;
  linkM3u8: string;
}

export interface XoEpisodeServer {
  serverName: string;
  items: XoServerData[];
}

export interface XoMovieDetail extends XoMovie {
  content: string;
  status: string;
  episodeTotal: number;
  trailerUrl: string | null;
  actors: string[];
  directors: string[];
  time: string;
  episodes: XoEpisodeServer[];
}

export interface XoPagination {
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface XoPaged<T> {
  items: T[];
  pagination: XoPagination;
}
