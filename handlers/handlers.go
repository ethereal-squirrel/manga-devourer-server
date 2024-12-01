package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"devourer-server/helpers"
	"devourer-server/models"
)

func ErrorHandler(logger *log.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		for _, err := range c.Errors {
			logger.Printf("Error: %v", err)
		}

		if len(c.Errors) > 0 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal Server Error"})
		}
	}
}

func GetLibraries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var libraries []models.Library
		if err := db.Find(&libraries).Error; err != nil {
			c.Error(err)
			return
		}
		c.JSON(http.StatusOK, libraries)
	}
}

func CreateLibrary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var library models.Library
		if err := c.ShouldBindJSON(&library); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
			return
		}

		if err := db.Create(&library).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": err.Error()})
			return
		}

		var config models.Config
		if err := db.Where("key = ?", "scan_lock").First(&config).Error; err == nil {
			if config.Value == "1" {
				c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "Scan already in progress."})
				return
			}
		}

		config.Value = "1"
		db.Save(&config)

		go scanLibraryBackground(db, library)

		c.JSON(http.StatusCreated, gin.H{"status": true, "message": "Library created."})
	}
}

func GetScanStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var config models.Config
		if err := db.Where("key = ?", "scan_lock").First(&config).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Scan status not found."})
			return
		}
		c.JSON(http.StatusOK, config)
	}
}

func MarkSeriesAsRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var series models.Series

		if err := db.Table("series").
			Select("series.*").
			Where("series.library_id = ?", id).
			Scan(&series).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch series."})
			return
		}

		var files []models.File
		if err := db.Where("series_id = ?", id).Find(&files).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to fetch associated files."})
			return
		}

		for _, file := range files {
			file.CurrentPage = file.TotalPages
			file.IsRead = true
			db.Save(&file)
		}

		c.JSON(http.StatusOK, gin.H{"status": true, "message": "Series marked as read."})
	}
}

func DeleteSeries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		fileDelete := c.Query("fileDelete")

		var series models.Series
		if err := db.Select("id, title, path, cover, library_id, created_at, updated_at, deleted_at").
			Where("id = ?", id).
			First(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Series not found."})
			return
		}

		var files []models.File
		if err := db.Where("series_id = ?", id).Find(&files).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to fetch associated files."})
			return
		}

		for _, file := range files {
			if fileDelete == "true" {
				os.Remove(file.Path)
			}

			db.Unscoped().Delete(&file)
		}

		if err := db.Unscoped().Delete(&series).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to delete series."})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": true, "message": "Series deleted."})
	}
}

func DeleteFile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		fileDelete := c.Query("fileDelete")

		var file models.File
		if err := db.First(&file, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found."})
			return
		}

		if fileDelete == "true" {
			os.Remove(file.Path)
		}

		if err := db.Unscoped().Delete(&file).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to delete file."})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": true, "message": "File deleted."})
	}
}

func MarkFileAsRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var file models.File
		if err := db.First(&file, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found."})
			return
		}

		file.CurrentPage = file.TotalPages
		file.IsRead = true
		db.Save(&file)

		c.JSON(http.StatusOK, gin.H{"status": true, "message": "File marked as read."})
	}
}
func GetLibrary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var library models.Library
		if err := db.First(&library, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Library not found."})
			return
		}

		var seriesList []struct {
			models.Series
			MangaData string `json:"manga_data"`
			FileCount int    `json:"file_count"`
		}

		if err := db.Table("series").
			Select("series.*, manga_data as manga_data, (SELECT COUNT(*) FROM files WHERE files.series_id = series.id) as file_count").
			Where("series.library_id = ?", id).
			Scan(&seriesList).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch series."})
			return
		}

		for i := range seriesList {
			if seriesList[i].MangaData != "" {
				var mangaData interface{}
				if err := json.Unmarshal([]byte(seriesList[i].MangaData), &mangaData); err == nil {
					seriesList[i].Series.MangaData = models.JSON(seriesList[i].MangaData)
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"status":  true,
			"library": library,
			"series":  seriesList,
		})
	}
}

func GetSeriesWithMangaData(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var series struct {
			models.Series
			MangaData string `json:"manga_data"`
		}

		if err := db.Table("series").
			Select("series.*, manga_data as manga_data").
			Where("series.id = ?", id).
			Scan(&series).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Series not found."})
			return
		}

		if series.MangaData != "" {
			var mangaData interface{}
			if err := json.Unmarshal([]byte(series.MangaData), &mangaData); err == nil {
				series.Series.MangaData = models.JSON(series.MangaData)
			}
		}

		var files []models.File
		if err := db.Where("series_id = ?", id).Find(&files).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "error": "Failed to fetch associated files."})
			return
		}

		response := struct {
			Series models.Series `json:"series"`
			Files  []models.File `json:"files"`
		}{
			Series: series.Series,
			Files:  files,
		}

		c.JSON(http.StatusOK, response)
	}
}

func ScanLibrary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var library models.Library
		if err := db.First(&library, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"status": false, "error": "Library not found."})
			return
		}

		var config models.Config
		if err := db.Where("key = ?", "scan_lock").First(&config).Error; err == nil {
			if config.Value == "1" {
				c.JSON(http.StatusBadRequest, gin.H{"status": false, "error": "Scan already in progress."})
				return
			}
		}

		config.Value = "1"
		db.Save(&config)

		go scanLibraryBackground(db, library)

		c.JSON(http.StatusOK, gin.H{"status": true, "message": "Library scan initiated."})
	}
}

func scanLibraryBackground(db *gorm.DB, library models.Library) {
	files, err := helpers.ScanDirectory(library.Path)
	if err != nil {
		log.Printf("Failed to scan directory: %v", err)
		return
	}

	var imageExtensions = []string{".jpg", ".png", ".jpeg", ".webp"}
	var localFilesScanned []string

	for _, file := range files {
		pathParts := strings.Split(file.Path, string(os.PathSeparator))
		skip := false

		for _, part := range pathParts {
			if part == ".yacreaderlibrary" || part == "covers" || part == "Covers" || part == "cover" || part == "Cover" {
				skip = true
				break
			}
		}

		if skip {
			continue
		}

		if file.Extension == ".zip" || file.Extension == ".cbz" || file.Extension == ".rar" || file.Extension == ".cbr" || file.Extension == ".7z" || file.Extension == ".cb7" {
			seriesPath := filepath.ToSlash(filepath.Dir(file.Path))
			seriesName := filepath.Base(seriesPath)

			log.Printf("Searching for series with path: %s", seriesPath)

			var series models.Series
			result := db.Select("id, title, path, cover, library_id, created_at, updated_at, deleted_at").
				Where("path = ?", seriesPath).
				First(&series)

			if result.Error != nil {
				if errors.Is(result.Error, gorm.ErrRecordNotFound) {
					log.Printf("Series not found, creating new series: %s", seriesName)
					series = models.Series{
						Title:     seriesName,
						Path:      seriesPath,
						LibraryID: library.ID,
					}
					if err := db.Create(&series).Error; err != nil {
						log.Printf("Failed to create series: %v", err)
						continue
					}

					mangaData, err := helpers.FindSeries(seriesName)

					if err == nil {
						series.MangaData = models.JSON(mangaData)
						db.Save(&series)

						var mangaDataStruct models.MangaData
						err = json.Unmarshal([]byte(mangaData), &mangaDataStruct)
						if err == nil {
							if mangaDataStruct.Images.JPG.LargeImageURL != "" {
								coverPath := filepath.Join("assets", "series", fmt.Sprintf("%d.jpg", series.ID))
								err := helpers.DownloadImage(mangaDataStruct.Images.JPG.LargeImageURL, coverPath)
								if err == nil {
									series.Cover = coverPath
									db.Save(&series)
								}
							}
						} else {
							log.Printf("Failed to unmarshal manga data: %v", err)
						}
					}

					time.Sleep(1 * time.Second)
				} else {
					log.Printf("Database error when finding series: %v", result.Error)
					continue
				}
			} else {
				log.Printf("Found existing series: %s", series.Title)
			}

			println("file.Path: ", file.Path)

			var fileModel models.File
			result = db.Where("path = ?", file.Path).First(&fileModel)
			if result.Error != nil {
				if errors.Is(result.Error, gorm.ErrRecordNotFound) {
					log.Printf("File not found, creating new file: %s", file.Path)
					volume, chapter := helpers.ExtractVolumeAndChapter(filepath.Base(file.Path))
					fileModel = models.File{
						Path:       file.Path,
						FileFormat: file.Extension,
						Volume:     volume,
						Chapter:    chapter,
						SeriesID:   series.ID,
					}
					if err := db.Create(&fileModel).Error; err != nil {
						log.Printf("Failed to create file: %v", err)
						continue
					}
					log.Printf("Created file: %s", file.Path)

					var totalPages int
					var err error
					if file.Extension == ".zip" || file.Extension == ".cbz" {
						totalPages, err = helpers.ProcessZipFile(file.Path, int(fileModel.ID))
					} else if file.Extension == ".rar" || file.Extension == ".cbr" {
						totalPages, err = helpers.ProcessRarFile(file.Path, int(fileModel.ID))
					} else if file.Extension == ".7z" || file.Extension == ".cb7" {
						totalPages, err = helpers.Process7zFile(file.Path, int(fileModel.ID))
					}
					if err == nil {
						fileModel.TotalPages = totalPages
						db.Save(&fileModel)
					} else {
						log.Printf("Error processing file %s: %v", file.Path, err)
					}
				} else {
					log.Printf("Database error when finding file: %v", result.Error)
					continue
				}
			} else {
				log.Printf("File already exists: %s", file.Path)
			}
		} else {
			var imageFound bool = false

			pathParts := strings.Split(file.Path, string(os.PathSeparator))
			seriesPath := strings.Join(pathParts[:len(pathParts)-2], string(os.PathSeparator))
			seriesName := filepath.Base(seriesPath)

			secondToLastElement := pathParts[len(pathParts)-2]
			dirPath := strings.Join(pathParts[:len(pathParts)-1], string(os.PathSeparator))

			seriesPath = filepath.ToSlash(seriesPath)
			dirPath = filepath.ToSlash(dirPath)

			if slices.Contains(localFilesScanned, dirPath) {
				continue
			}

			println("File path: ", file.Path)
			println("Series path: ", seriesPath)
			println("Dir path: ", dirPath)

			log.Printf("Searching for series %s with path: %s", seriesName, seriesPath)

			volume, chapter := helpers.ExtractVolumeAndChapter(secondToLastElement)
			println("Volume: ", volume, "Chapter: ", chapter)

			for _, imageExtension := range imageExtensions {
				if strings.HasSuffix(file.Path, imageExtension) {
					imageFound = true
					if len(pathParts) >= 2 {
						localFiles, err := helpers.ScanDirectory(dirPath)

						if err != nil {
							log.Printf("Failed to scan directory: %v", err)
							continue
						}

						println("Found ", len(localFiles), " files in folder: ", dirPath)

						localFilesScanned = append(localFilesScanned, dirPath)
					} else {
						println("File path does not have enough elements: ", file.Path)
						continue
					}
				}
			}

			if !imageFound {
				println("No images found in: ", dirPath)
			} else {
				println("Images found in: ", dirPath)

				var series models.Series
				result := db.Select("id, title, path, cover, library_id, created_at, updated_at, deleted_at").
					Where("path = ?", seriesPath).
					First(&series)

				if result.Error != nil {
					if errors.Is(result.Error, gorm.ErrRecordNotFound) {
						log.Printf("Series not found, creating new series: %s", seriesName)
						series = models.Series{
							Title:     seriesName,
							Path:      seriesPath,
							LibraryID: library.ID,
						}
						if err := db.Create(&series).Error; err != nil {
							log.Printf("Failed to create series: %v", err)
							continue
						}

						mangaData, err := helpers.FindSeries(seriesName)

						if err == nil {
							series.MangaData = models.JSON(mangaData)
							db.Save(&series)

							var mangaDataStruct models.MangaData
							err = json.Unmarshal([]byte(mangaData), &mangaDataStruct)
							if err == nil {
								if mangaDataStruct.Images.JPG.LargeImageURL != "" {
									coverPath := filepath.Join("assets", "series", fmt.Sprintf("%d.jpg", series.ID))
									err := helpers.DownloadImage(mangaDataStruct.Images.JPG.LargeImageURL, coverPath)
									if err == nil {
										series.Cover = coverPath
										db.Save(&series)
									}
								}
							} else {
								log.Printf("Failed to unmarshal manga data: %v", err)
							}
						}

						time.Sleep(1 * time.Second)
					} else {
						log.Printf("Database error when finding series: %v", result.Error)
						continue
					}
				} else {
					log.Printf("Found existing series: %s", series.Title)
				}

				var fileModel models.File
				result = db.Where("path = ?", dirPath).First(&fileModel)
				if result.Error != nil {
					if errors.Is(result.Error, gorm.ErrRecordNotFound) {
						log.Printf("File not found, creating new file: %s", dirPath)

						fileModel = models.File{
							Path:       dirPath,
							FileFormat: "folder",
							Volume:     volume,
							Chapter:    chapter,
							SeriesID:   series.ID,
						}
						if err := db.Create(&fileModel).Error; err != nil {
							log.Printf("Failed to create file: %v", err)
							continue
						}
						log.Printf("Created file: %s", dirPath)

						var totalPages int = 0
						var err error

						err = helpers.ProcessDirectImage(file.Path, int(fileModel.ID))

						if err != nil {
							log.Printf("Error processing file %s: %v", file.Path, err)
							continue
						}

						filePath, err := os.ReadDir(dirPath)
						if err != nil {
							log.Printf("Failed to read directory: %v", err)
						} else {
							totalPages = len(filePath)
						}

						if err == nil {
							fileModel.TotalPages = totalPages
							db.Save(&fileModel)
						} else {
							log.Printf("Error processing file %s: %v", file.Path, err)
						}
					} else {
						log.Printf("Database error when finding file: %v", result.Error)
					}
				} else {
					println("File already exists: %s", file.Path)
					log.Printf("File already exists: %s", file.Path)
				}
			}
		}
	}

	var config models.Config
	if err := db.Where("key = ?", "scan_lock").First(&config).Error; err == nil {
		config.Value = "0"
		db.Save(&config)
	}

	log.Printf("Library scan completed for library ID: %d", library.ID)
}

func GetSeries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var series models.Series
		if err := db.Preload("Files").First(&series, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Series not found."})
			return
		}
		c.JSON(http.StatusOK, series)
	}
}

func GetSeriesFiles(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var files []models.File
		if err := db.Where("series_id = ?", id).Find(&files).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Files not found."})
			return
		}
		c.JSON(http.StatusOK, files)
	}
}

func GetFile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var file models.File
		if err := db.First(&file, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found."})
			return
		}
		c.JSON(http.StatusOK, file)
	}
}

func SetCurrentPage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		page, err := strconv.Atoi(c.Param("page"))

		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid page number."})
			return
		}

		var file models.File
		if err := db.First(&file, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found."})
			return
		}

		file.CurrentPage = page

		if page == file.TotalPages {
			file.IsRead = true
		}

		if err := db.Save(&file).Error; err != nil {
			c.Error(err)
			return
		}

		c.JSON(http.StatusOK, file)
	}
}
func StreamFile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		seriesId, filePath, err := validateInput(c)
		if err != nil {
			handleError(c, http.StatusBadRequest, err.Error())
			return
		}

		cleanPath, err := validateFilePath(db, seriesId, filePath)
		if err != nil {
			handleError(c, http.StatusBadRequest, err.Error())
			return
		}

		isFolder, ext, err := getFileInfo(cleanPath)
		if err != nil {
			handleError(c, http.StatusInternalServerError, err.Error())
			return
		}

		if isFolder {
			streamFolder(c, cleanPath, ext)
		} else {
			streamFile(c, cleanPath, ext)
		}
	}
}

func validateInput(c *gin.Context) (string, string, error) {
	seriesId := c.Query("seriesId")
	filePath := c.Query("path")

	if seriesId == "" {
		return "", "", errors.New("series id is required")
	}
	if filePath == "" {
		return "", "", errors.New("file path is required")
	}

	return seriesId, filePath, nil
}

func validateFilePath(db *gorm.DB, seriesId, filePath string) (string, error) {
	var series models.Series
	if err := db.Select("id, title, library_id, path").Where("id = ?", seriesId).First(&series).Error; err != nil {
		return "", errors.New("series not found")
	}

	var library models.Library
	if err := db.First(&library, series.LibraryID).Error; err != nil {
		return "", errors.New("library not found")
	}

	normalizedFilePath := filepath.ToSlash(filePath)
	normalizedLibraryPath := filepath.ToSlash(library.Path)

	if !strings.HasPrefix(normalizedFilePath, normalizedLibraryPath) {
		return "", errors.New("file path is not within the library path")
	}

	cleanPath := filepath.Clean(filePath)
	if !filepath.IsAbs(cleanPath) {
		cleanPath = filepath.Join(".", cleanPath)
	}

	if _, err := os.Stat(cleanPath); os.IsNotExist(err) {
		return "", errors.New("file not found")
	}

	return cleanPath, nil
}

func getFileInfo(cleanPath string) (bool, string, error) {
	fileInfo, err := os.Stat(cleanPath)
	if err != nil {
		return false, "", errors.New("failed to get file info")
	}

	isFolder := fileInfo.IsDir()
	ext := strings.ToLower(filepath.Ext(cleanPath))

	return isFolder, ext, nil
}

func streamFolder(c *gin.Context, cleanPath, ext string) {
	println("Streaming folder: ", cleanPath)

	tempZipFile, err := createTempZip(cleanPath)
	if err != nil {
		handleError(c, http.StatusInternalServerError, err.Error())
		return
	}
	defer os.Remove(tempZipFile.Name())

	setHeaders(c, cleanPath, ext, true)
	c.File(tempZipFile.Name())
}

func streamFile(c *gin.Context, cleanPath, ext string) {
	if ext == ".cbr" || ext == ".rar" {
		tempZipFile, err := convertRarToZip(cleanPath)
		if err != nil {
			handleError(c, http.StatusInternalServerError, err.Error())
			return
		}
		defer os.Remove(tempZipFile.Name())

		setHeaders(c, cleanPath, ext, true)
		c.File(tempZipFile.Name())
	} else {
		setHeaders(c, cleanPath, ext, false)
		c.File(cleanPath)
	}
}

func createTempZip(cleanPath string) (*os.File, error) {
	tempZipFile, err := os.CreateTemp("", "temp-*.zip")
	if err != nil {
		return nil, errors.New("failed to create temp zip file")
	}

	if err := helpers.ZipDirectory(cleanPath, tempZipFile.Name()); err != nil {
		return nil, errors.New("failed to create zip file")
	}

	return tempZipFile, nil
}

func convertRarToZip(cleanPath string) (*os.File, error) {
	tempDir, err := os.MkdirTemp("", "unrar-*")
	if err != nil {
		return nil, errors.New("failed to create temp directory")
	}
	defer os.RemoveAll(tempDir)

	if err := helpers.UnrarFile(cleanPath, tempDir); err != nil {
		return nil, errors.New("failed to unrar file")
	}

	return createTempZip(tempDir)
}

func convert7zToZip(cleanPath string) (*os.File, error) {
	tempDir, err := os.MkdirTemp("", "un7z-*")
	if err != nil {
		return nil, errors.New("failed to create temp directory")
	}
	defer os.RemoveAll(tempDir)

	if err := helpers.Un7zFile(cleanPath, tempDir); err != nil {
		return nil, errors.New("failed to un7z file")
	}

	return createTempZip(tempDir)
}

func setHeaders(c *gin.Context, cleanPath, ext string, isZip bool) {
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")

	if isZip {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.zip", strings.TrimSuffix(filepath.Base(cleanPath), ext)))
		c.Header("Content-Type", "application/zip")
	} else {
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filepath.Base(cleanPath)))
		c.Header("Content-Type", "application/octet-stream")
	}
}

func handleError(c *gin.Context, statusCode int, message string) {
	c.JSON(statusCode, gin.H{"status": false, "error": message})
}
