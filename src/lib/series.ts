import { createCanvas, loadImage } from "canvas";
import * as fs from "fs";
import * as path from "path";

import { prisma } from "./prisma";
import { Library, MangaData } from "../types/types";
import { deleteAllFiles } from "./file";
import { jikanLimiter } from "./rateLimit";

export const createSeries = async (payload: Library) => {
  try {
    const library = await prisma.library.create({
      data: payload,
    });

    return { status: true, library };
  } catch (e) {
    return { status: false, message: "Failed to create library." };
  }
};

export const getAllSeries = async (libraryId: number) => {
  let series = await prisma.series.findMany({
    where: {
      libraryId: libraryId,
    },
  });

  series = series.map((series) => {
    const { synopsis, background, ...restMangaData } = JSON.parse(
      series.mangaData
    );

    return {
      ...series,
      mangaData: restMangaData,
    };
  });

  return series;
};

export const getSeries = async (id: number) => {
  const series = await prisma.series.findUnique({
    where: { id },
  });

  const fileCount = await prisma.file.count({
    where: { seriesId: id },
  });

  return {
    status: true,
    ...series,
    mangaData: JSON.parse(series?.mangaData || "{}"),
    fileCount,
  };
};

export const updateSeriesTitle = async (id: number, title: string) => {
  await prisma.series.update({
    where: { id },
    data: { title },
  });

  return { status: true };
};

export const updateSeriesMangaData = async (
  id: number,
  mangaData: MangaData
) => {
  await prisma.series.update({
    where: { id },
    data: { mangaData: JSON.stringify(mangaData) },
  });

  return { status: true };
};

export const updateSeriesImage = async (id: number, imageBuffer: Buffer) => {
  const series = await prisma.series.findUnique({
    where: { id },
  });

  if (!series) {
    return { status: false, message: "Series not found" };
  }

  const library = await prisma.library.findUnique({
    where: { id: series.libraryId },
  });

  if (!library) {
    return { status: false, message: "Library not found" };
  }

  try {
    console.log("Loading image from buffer...");
    const image = await loadImage(imageBuffer);
    console.log("Image loaded, dimensions:", image.width, "x", image.height);

    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    const outputBuffer = canvas.toBuffer("image/jpeg", {
      quality: 0.7,
      progressive: true,
    });

    const outputPath = path.join(
      library.path,
      ".mangadevourer",
      "series",
      series.id.toString(),
      "cover.jpg"
    );

    // Ensure directory exists
    //await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    // Write the file
    await fs.promises.writeFile(outputPath, outputBuffer);

    return { status: true, path: outputPath };
  } catch (error) {
    console.error("Error updating series cover image:", error);
    return { status: false, message: "Failed to update series cover image" };
  }
};

export const getFilesBySeriesId = async (seriesId: number) => {
  const files = await prisma.file.findMany({
    where: { seriesId },
  });

  return { status: true, files };
};

export const deleteSeries = async (seriesId: number) => {
  await deleteAllFiles(seriesId);

  await prisma.series.delete({
    where: { id: seriesId },
  });

  return { status: true };
};

export const getComicMetadata = async (by: string, query: string) => {
  //
};

export const getJikanUrl = (by: string, query: string) => {
  if (!["id", "title"].includes(by)) {
    throw new Error("invalid selector");
  }

  return `https://api.jikan.moe/v4/manga${
    by === "id" ? `/${query}` : `?q=${query}`
  }`;
};

export const getMangaMetadata = async (
  provider: string,
  by: string,
  query: string
) => {
  if (!["id", "title"].includes(by)) {
    throw new Error("invalid selector");
  }

  if (query.length === 0) {
    throw new Error("query cannot be empty");
  }

  let url = "";

  switch (provider) {
    case "jikan":
      url = getJikanUrl(by, query);
      break;
  }

  try {
    const response = await jikanLimiter.schedule(() => fetch(url));

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const mangaResp = await response.json();

    if (mangaResp.data.length === 0) {
      throw new Error("no results found");
    }

    let selectedManga = null;

    for (const e of mangaResp.data) {
      if (
        e.titles.some((t: any) => t.title.toLowerCase() === query.toLowerCase())
      ) {
        selectedManga = e;
        break;
      }
    }

    if (!selectedManga) {
      selectedManga = mangaResp.data[0];
    }

    const metadata: MangaData = {
      metadata_id: selectedManga.mal_id,
      metadata_provider: "jikan",
      title: selectedManga.title ? selectedManga.title : null,
      titles: selectedManga.titles ? selectedManga.titles : [],
      synopsis: selectedManga.synopsis ? selectedManga.synopsis : null,
      background: selectedManga.background ? selectedManga.background : null,
      coverImage: selectedManga.images
        ? selectedManga.images.webp.image_url
        : null,
      authors: selectedManga.authors
        ? selectedManga.authors.map((author: any) => author.name)
        : [],
      demographics: selectedManga.demographics
        ? selectedManga.demographics.map((demographic: any) => demographic.name)
        : [],
      genres: selectedManga.genres
        ? selectedManga.genres.map((genre: any) => genre.name)
        : [],
      themes: selectedManga.themes
        ? selectedManga.themes.map((theme: any) => theme.name)
        : [],
      score: selectedManga.score ? selectedManga.score : null,
      url: selectedManga.url ? selectedManga.url : null,
      total_volumes: selectedManga.volumes ? selectedManga.volumes : null,
      total_chapters: selectedManga.chapters ? selectedManga.chapters : null,
      published_from: selectedManga.published.from
        ? selectedManga.published.from
        : null,
      published_to: selectedManga.published.to
        ? selectedManga.published.to
        : null,
      status: selectedManga.status ? selectedManga.status : null,
    };

    return metadata;
  } catch (error) {
    console.log(`failed to fetch data: ${error}`);

    return {};
  }
};

export const createSeriesPayload = async (
  provider: string,
  libraryId: number,
  series: string,
  path: string,
  mal_id: any = null,
  retrieveMetadata: boolean = false
) => {
  let metadata = null as any;

  if (retrieveMetadata) {
    metadata = await getMangaMetadata(
      provider,
      mal_id ? "id" : "title",
      mal_id || series
    );
  }

  return {
    title: series,
    path,
    cover: "",
    libraryId,
    mangaData: metadata,
  };
};
