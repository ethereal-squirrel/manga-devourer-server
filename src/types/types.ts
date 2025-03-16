export interface Library {
  name: string;
  path: string;
}

export interface MangaData {
  metadata_id?: number;
  metadata_provider?: string;
  title?: string;
  titles?: string[];
  synopsis?: string;
  background?: string;
  coverImage?: string;
  authors?: string[];
  demographics?: string[];
  genres?: string[];
  themes?: string[];
  score?: number;
  url?: string;
  total_volumes?: number;
  total_chapters?: number;
  published_from?: string;
  published_to?: string;
  status?: string;
}
