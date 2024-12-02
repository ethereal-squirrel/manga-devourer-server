package helpers

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

type FileInfo struct {
	Path      string
	Extension string
}

func ScanDirectory(dirPath string) ([]FileInfo, error) {
	var results []FileInfo

	println("Scanning directory: ", dirPath)

	err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			println("Error scanning directory: ", err)
		}
		if info == nil {
			return nil
		}
		if !info.IsDir() {
			results = append(results, FileInfo{
				Path:      path,
				Extension: strings.ToLower(filepath.Ext(info.Name())),
			})
		}
		return nil
	})

	return results, err
}

func ExtractVolumeAndChapter(filename string) (int, int) {
	volume := 0
	chapter := 0

	cleanedFilename := cleanFilename(filename)

	volumeRe := regexp.MustCompile(`(?i)(?:v|vol|volume)\.?(\d+)`)
	if match := volumeRe.FindStringSubmatch(cleanedFilename); len(match) > 1 {
		volume, _ = strconv.Atoi(match[1])
	}

	chapterRe := regexp.MustCompile(`(?i)c(\d+)`)
	if match := chapterRe.FindStringSubmatch(cleanedFilename); len(match) > 1 {
		chapter, _ = strconv.Atoi(match[1])
	} else {
		standaloneRe := regexp.MustCompile(`(^|\D)(\d{2,4})($|\D)`)
		if matches := standaloneRe.FindAllStringSubmatch(cleanedFilename, -1); len(matches) > 0 {
			lastMatch := matches[len(matches)-1]
			possibleChapter, _ := strconv.Atoi(lastMatch[2])
			if volume == 0 {
				chapter = possibleChapter
			}
		}
	}

	return volume, chapter
}

func cleanFilename(filename string) string {
	re := regexp.MustCompile(`\[.*?\]|\(.*?\)|\{.*?\}`)
	return strings.TrimSpace(re.ReplaceAllString(filename, ""))
}
