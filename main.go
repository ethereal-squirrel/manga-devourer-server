package main

import (
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"devourer-server/config"
	"devourer-server/handlers"
	"devourer-server/models"
)

func main() {
	cfg := config.Load()

	logger := log.New(os.Stdout, "LUXI: ", log.LstdFlags)

	createDirectories(logger)

	db, err := initDB(logger)
	if err != nil {
		logger.Fatalf("Failed to connect to database: %v", err)
	}

	router := setupRouter(db, logger)

	logger.Printf("Starting server on %s:%s", cfg.Host, cfg.Port)
	if err := router.Run(cfg.Host + ":" + cfg.Port); err != nil {
		logger.Fatalf("Failed to start server: %v", err)
	}
}

func createDirectories(logger *log.Logger) {
	dirs := []string{"assets", "assets/series", "assets/previews"}
	baseDir := "."

	for _, dir := range dirs {
		fullPath := filepath.Join(baseDir, filepath.Clean(dir))

		if !strings.HasPrefix(fullPath, baseDir) {
			logger.Printf("Invalid directory path: %s", dir)
			continue
		}

		if err := os.MkdirAll(fullPath, 0755); err != nil {
			logger.Printf("Failed to create directory %s: %v", fullPath, err)
		}
	}
}

func initDB(logger *log.Logger) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open("library.db"), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	if err := db.AutoMigrate(&models.Config{}, &models.Library{}, &models.Series{}, &models.File{}); err != nil {
		return nil, err
	}

	var config models.Config
	if err := db.Where("key = ?", "scan_lock").First(&config).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			config = models.Config{
				Key:   "scan_lock",
				Value: "0",
			}

			db.Create(&config)
		} else {
			logger.Printf("Failed to check for scan_lock entry: %v", err)
		}
	}

	return db, nil
}

func setupRouter(db *gorm.DB, logger *log.Logger) *gin.Engine {
	if _, err := os.Executable(); err == nil {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()

	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	router.Use(cors.New(config))

	router.Use(handlers.ErrorHandler(logger))

	api := router.Group("/")
	{
		api.GET("/libraries", handlers.GetLibraries(db))
		api.POST("/libraries", handlers.CreateLibrary(db))
		api.GET("/library/:id", handlers.GetLibrary(db))
		api.POST("/library/:id/scan", handlers.ScanLibrary(db))
		api.GET("/series/:id", handlers.GetSeries(db))
		api.GET("/series/:id/files", handlers.GetSeriesFiles(db))
		api.DELETE("/series/:id", handlers.DeleteSeries(db))
		api.GET("/file/:id", handlers.GetFile(db))
		api.DELETE("/file/:id", handlers.DeleteFile(db))
		api.POST("/file/:id/page/:page", handlers.SetCurrentPage(db))
		api.GET("/get-file", handlers.StreamFile(db))
		api.GET("/series/:id/manga-data", handlers.GetSeriesWithMangaData(db))
		api.GET("/scan-status", handlers.GetScanStatus(db))
		api.POST("/series/:id/mark-as-read", handlers.MarkSeriesAsRead(db))
		api.POST("/file/:id/mark-as-read", handlers.MarkFileAsRead(db))
	}

	router.Static("/assets", "./assets")

	return router
}
