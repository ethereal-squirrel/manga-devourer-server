package helpers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"devourer-server/models"
)

func FindSeries(path string) (string, error) {
	searchTerm := url.QueryEscape(filepath.Base(path))
	url := fmt.Sprintf("https://api.jikan.moe/v4/manga?q=%s", searchTerm)

	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to fetch data: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %v", err)
	}

	var mangaResp models.MangaResponse
	if err := json.Unmarshal(body, &mangaResp); err != nil {
		return "", fmt.Errorf("failed to decode response: %v", err)
	}

	if len(mangaResp.Data) == 0 {
		return "", fmt.Errorf("no results found")
	}

	var selectedManga models.MangaData
	for _, e := range mangaResp.Data {
		if strings.EqualFold(e.Titles[0].Title, searchTerm) {
			selectedManga = e
			break
		}
	}

	if selectedManga.MalID == 0 {
		selectedManga = mangaResp.Data[0]
	}

	jsonData, err := json.Marshal(selectedManga)
	if err != nil {
		return "", fmt.Errorf("failed to marshal manga data to JSON: %v", err)
	}

	return string(jsonData), nil
}

func DownloadImage(url, filepath string) error {
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("failed to GET image: %v", err)
	}
	defer resp.Body.Close()

	out, err := os.Create(filepath)
	if err != nil {
		return fmt.Errorf("failed to create file: %v", err)
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to save image: %v", err)
	}

	return nil
}
