export interface Taxonomy {
  name: string;
  slug: string;
}
export interface Score {
  imdb: number | null;
  tmdb: number | null;
}
export interface Movie {
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
  categories: Taxonomy[];
  countries: Taxonomy[];
  score: Score;
}
export interface ServerItem {
  name: string;
  slug: string;
  linkEmbed: string;
  linkM3u8: string;
}
export interface EpisodeServer {
  serverName: string;
  items: ServerItem[];
}
export interface MovieDetail extends Movie {
  content: string;
  status: string;
  episodeTotal: number;
  trailerUrl: string | null;
  actors: string[];
  directors: string[];
  time: string;
  episodes: EpisodeServer[];
}
export interface Pagination {
  page: number;
  totalPages: number;
  totalItems: number;
}
export interface Paged<T> {
  items: T[];
  pagination: Pagination;
}
export interface HomeData {
  latest: Movie[];
  phimBo: Movie[];
  phimLe: Movie[];
  hoatHinh: Movie[];
}
export interface DetailData {
  movie: MovieDetail;
  similar: Movie[];
}
export interface FiltersData {
  categories: Taxonomy[];
  countries: Taxonomy[];
  years: number[];
}
