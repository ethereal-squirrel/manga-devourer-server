# Manga Devourer (Server)

A manga library server created to provide a highly performant system to archive, scan and catalog your manga.

### Features

- A fast manga library server written in Go.
- Supports folders of images, .zip, .cbz, .rar and .cbr archives (_support for 7z, tar to come soon_).
- Automatically retrieve metadata from MyAnimeList.
- Provides a simple API server to perform actions.
- Streams selected archives back to the client.
- SQLite powered storage.
- Retrieves relevant cover images and generates a preview image for each archive in addition.
- Supports Windows, Linux and Mac.

### Binary Releases

TBC

### Manual Install

- Ensure you have Golang installed.
- Clone this repository and cd into the folder.
- To Run: go run .
- To Build: go build .

### How To Use

The server exposes the following API endpoints on port 9024. Or, you can just use [Manga Devourer](#); an application designed to work with this server.

#### [GET] /libraries

Get a list of all libraries.

#### [POST] /libraries

Create a new library. Accept a JSON payload of **name** (name of library) and **path** (absolute path to the folder you wish to add).

####[GET] /library/:id
Retrieve details for the specified library.

#### [POST] /library/:id/scan

Scan the specified library.

####[GET] /series/:id
Retrieve details for the specified series.

#### [GET] /file/:id

Retrieve details for the specified file.

#### [POST] /file/:id/page/:page
Set the current page of the specified file.

#### [GET] /get-file?path=:path

This returns the relevant file as a blob, as a .zip archive.

#### [GET] /assets

The assets folder is bound as a static directory to serve cover and preview images.
