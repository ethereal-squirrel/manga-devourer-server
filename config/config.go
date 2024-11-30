package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Host         string
	Port         string
	DatabasePath string
	AssetsPath   string
	Debug        bool
}

func Load() *Config {
	// Load .env file if it exists
	godotenv.Load()

	return &Config{
		Host:         getEnv("LUXI_HOST", "0.0.0.0"),
		Port:         getEnv("LUXI_PORT", "9024"),
		DatabasePath: getEnv("LUXI_DB_PATH", "library.db"),
		AssetsPath:   getEnv("LUXI_ASSETS_PATH", "./assets"),
		Debug:        getBoolEnv("LUXI_DEBUG", false),
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getBoolEnv(key string, fallback bool) bool {
	strValue := getEnv(key, "")
	if value, err := strconv.ParseBool(strValue); err == nil {
		return value
	}
	return fallback
}
