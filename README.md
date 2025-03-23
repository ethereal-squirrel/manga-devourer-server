# Manga Devourer (Server)

A manga library server created to provide a highly performant system to archive, scan and catalog your manga.

### Features

- A fast manga library server written in Node.js.
- Supports folders of images, .zip, .cbz, .rar and .cbr archives (_support for 7z, tar to come soon_).
- Automatically retrieve metadata from various providers.
- Provides a simple API server to perform actions.
- Streams selected archives back to the client.
- SQLite powered storage.
- Retrieves relevant cover images and generates a preview image for each archive in addition.
- Supports Windows, Linux and Mac.

### Binary Releases

[Releases page](https://github.com/ethereal-squirrel/manga-devourer-server/releases)

### Manual Install

- Ensure you have Node.js installed.
- Clone this repository and cd into the folder.
- Install Dependencies: npm i
- Generate Prisma Client: npx prisma generate
- Run Database Migrations: npx prisma migrate dev
- To Build: tsc
- To Run: node dist/index.js

### How To Use

The server exposes the following API endpoints on port 9024. Or, you can just use [Devourer](https://devourer.app); an application designed to work with this server.

#### [GET] /libraries

Get a list of all libraries.

#### [POST] /libraries

Create a new library. Accept a JSON payload of **name** (name of library) and **path** (absolute path to the folder you wish to add).

Expects: { "name": "Manga", "path": "D:\\Manga" }

#### [GET] /library/:id

Retrieve details for the specified library.

#### [POST] /library/:id/scan

Scan the specified library.

#### [POST] /library/:id/scan-status

Retrieve scan status details.

#### [GET] /series/:id

Retrieve details for the specified series.

#### [DELETE] /series/:id

Delete the specified series.

#### [GET] /series/:id/files

Retrieve files for the specified series.

#### [GET] /file/:id

Retrieve details for the specified file.

#### [DELETE] /file/:id

Delete the specified file.

#### [GET] /get-file/:id

This returns the relevant file  as a .zip archive. If the archive is not a zip, it will extract it and convert it to a zip; this is to support clients that only have zip support.

#### [POST] /mark-as-read

Mark the specified file as read.

Expects: { "fileId": 1 }

#### [POST] /mark-all-as-read

Mark all files the specified series as read.

Expects: { "seriesId": 1 }

#### [POST] /page-event

Set the current page of the specified file.

Expects: { "fileId": 1, "page": 1 }

#### [GET] /cover-image/:libraryId/:seriesId.jpg

Retrieve the cover file for the specified series.

#### [GET] /preview-image/:libraryId/:seriesId/:fileId.jpg

Retrieve the preview file for the specified file.

You can also run the following commands at the command line.

#### ./manga-devourer-server create-library :name :path

This will create a library with the specified name aimed at the specified path (e.g. "./manga-devourer-server create-library Manga D:/Manga").

#### ./manga-devourer-server scan-library :libraryId

This will scan the specified library.

#### ./manga-devourer-server scan-status :libraryId

This will retrieve the scan status of the specified library.
