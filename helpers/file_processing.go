package helpers

import (
	"archive/zip"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/bodgit/sevenzip"
	"github.com/nwaples/rardecode"
	"golang.org/x/image/draw"
	"golang.org/x/image/webp"
)

func ProcessDirectImage(imagePath string, fileID int) error {
	file, err := os.Open(imagePath)

	if err != nil {
		return fmt.Errorf("failed to open image file: %v", err)
	}
	defer file.Close()

	img, err := decodeImage(file, filepath.Ext(imagePath))

	if err != nil {
		return fmt.Errorf("failed to decode image file: %v", err)
	}

	if err := savePreview(img, fileID); err != nil {
		return fmt.Errorf("failed to save preview: %v", err)
	}

	return nil
}

func ProcessZipFile(zipPath string, fileID int) (int, error) {
	reader, err := zip.OpenReader(zipPath)
	if err != nil {
		return 0, fmt.Errorf("failed to open zip file: %v", err)
	}
	defer reader.Close()

	fileCount := len(reader.File)
	fileNames := make([]string, 0, fileCount)

	for _, file := range reader.File {
		fileNames = append(fileNames, file.Name)
	}

	sort.Strings(fileNames)

	for _, fileName := range fileNames {
		if isImageFile(fileName) {
			for _, file := range reader.File {
				if file.Name == fileName {
					if err := extractImage(file, fileID); err != nil {
						return fileCount, fmt.Errorf("failed to extract image: %v", err)
					}
					return fileCount, nil
				}
			}
		}
	}

	return fileCount, nil
}

func ProcessRarFile(rarPath string, fileID int) (int, error) {
	reader, err := rardecode.OpenReader(rarPath, "")
	if err != nil {
		return 0, fmt.Errorf("failed to open rar file: %v", err)
	}
	defer reader.Close()

	var fileNames []string
	fileCount := 0

	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, fmt.Errorf("error reading rar: %v", err)
		}
		if !header.IsDir {
			fileNames = append(fileNames, header.Name)
			fileCount++
		}
	}

	sort.Strings(fileNames)

	reader.Close()
	reader, _ = rardecode.OpenReader(rarPath, "")

	for _, fileName := range fileNames {
		if isImageFile(fileName) {
			for {
				header, err := reader.Next()
				if err != nil {
					return fileCount, fmt.Errorf("error reading rar: %v", err)
				}
				if header.Name == fileName {
					if err := extractRarImage(reader, fileID); err != nil {
						return fileCount, fmt.Errorf("failed to extract image: %v", err)
					}
					return fileCount, nil
				}
			}
		}
	}

	return fileCount, nil
}

func Process7zFile(archivePath string, fileID int) (int, error) {
	archive, err := sevenzip.OpenReader(archivePath)
	if err != nil {
		return 0, fmt.Errorf("failed to open 7z archive: %v", err)
	}
	defer archive.Close()

	var fileNames []string
	fileCount := 0

	for _, file := range archive.File {
		if !file.FileInfo().IsDir() {
			fileNames = append(fileNames, file.Name)
			fileCount++
		}
	}

	sort.Strings(fileNames)

	for _, fileName := range fileNames {
		if isImageFile(fileName) {
			for _, file := range archive.File {
				if file.Name == fileName {
					srcFile, err := file.Open()
					if err != nil {
						return fileCount, fmt.Errorf("failed to open file in archive: %v", err)
					}
					defer srcFile.Close()

					if err := extractRarImage(srcFile, fileID); err != nil {
						return fileCount, fmt.Errorf("failed to extract image: %v", err)
					}
					return fileCount, nil
				}
			}
		}
	}

	return fileCount, nil
}

func extractImage(file *zip.File, seriesID int) error {
	src, err := file.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	ext := filepath.Ext(file.Name)
	img, err := decodeImage(src, ext)
	if err != nil {
		return fmt.Errorf("failed to decode image: %v", err)
	}

	return savePreview(img, seriesID)
}

func extractRarImage(reader io.Reader, seriesID int) error {
	tempFile, err := os.CreateTemp("", "rar_extract_*.jpg")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %v", err)
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	if _, err := io.Copy(tempFile, reader); err != nil {
		return fmt.Errorf("failed to copy image data: %v", err)
	}

	tempFile.Seek(0, 0)
	img, err := jpeg.Decode(tempFile)
	if err != nil {
		return fmt.Errorf("failed to decode image: %v", err)
	}

	return savePreview(img, seriesID)
}

func savePreview(img image.Image, seriesID int) error {
	previewPath := fmt.Sprintf("./assets/previews/%d_preview.jpg", seriesID)
	previewFile, err := os.Create(previewPath)
	if err != nil {
		return fmt.Errorf("failed to create preview file: %v", err)
	}
	defer previewFile.Close()

	return thumbnail(img, previewFile, 480)
}

func thumbnail(src image.Image, w io.Writer, width int) error {
	bounds := src.Bounds()
	height := int(float64(width) * float64(bounds.Dy()) / float64(bounds.Dx()))
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.NearestNeighbor.Scale(dst, dst.Rect, src, bounds, draw.Over, nil)
	return jpeg.Encode(w, dst, nil)
}

func isImageFile(fileName string) bool {
	ext := strings.ToLower(filepath.Ext(fileName))
	return ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".webp" || ext == ".gif" || ext == ".bmp" || ext == ".avif"
}

func decodeImage(r io.Reader, ext string) (image.Image, error) {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return jpeg.Decode(r)
	case ".png":
		return png.Decode(r)
	case ".webp":
		return webp.Decode(r)
	case ".gif":
		return gif.Decode(r)
	default:
		return nil, fmt.Errorf("unsupported image format: %s", ext)
	}
}

func UnrarFile(rarPath, destDir string) error {
	rr, err := rardecode.OpenReader(rarPath, "")
	if err != nil {
		return err
	}
	defer rr.Close()

	for {
		header, err := rr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		destPath := filepath.Join(destDir, header.Name)
		if header.IsDir {
			os.MkdirAll(destPath, 0755)
			continue
		}

		os.MkdirAll(filepath.Dir(destPath), 0755)
		destFile, err := os.Create(destPath)
		if err != nil {
			return err
		}
		defer destFile.Close()

		if _, err := io.Copy(destFile, rr); err != nil {
			return err
		}
	}
	return nil
}

func Un7zFile(archivePath, destDir string) error {
	archive, err := sevenzip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("failed to open 7z archive: %v", err)
	}
	defer archive.Close()

	for _, file := range archive.File {
		destPath := filepath.Join(destDir, file.Name)

		if file.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			continue
		}

		os.MkdirAll(filepath.Dir(destPath), 0755)
		destFile, err := os.Create(destPath)
		if err != nil {
			return fmt.Errorf("failed to create file: %v", err)
		}
		defer destFile.Close()

		srcFile, err := file.Open()
		if err != nil {
			return fmt.Errorf("failed to open file in archive: %v", err)
		}
		defer srcFile.Close()

		if _, err := io.Copy(destFile, srcFile); err != nil {
			return fmt.Errorf("failed to copy file data: %v", err)
		}
	}

	return nil
}

func ZipDirectory(sourceDir, zipPath string) error {
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	archive := zip.NewWriter(zipFile)
	defer archive.Close()

	sourceDir = filepath.Clean(sourceDir)

	return filepath.Walk(sourceDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			println("Error walking directory: ", err)
			return err
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			println("Error creating header: ", err)
			return err
		}

		relPath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			println("Error getting relative path: ", err)
			return err
		}

		header.Name = filepath.ToSlash(relPath)
		if info.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}

		writer, err := archive.CreateHeader(header)
		if err != nil {
			println("Error creating header: ", err)
			return err
		}

		if info.IsDir() {
			return nil
		}

		file, err := os.Open(path)
		if err != nil {
			println("Error opening file: ", err)
			return err
		}
		defer file.Close()

		_, err = io.Copy(writer, file)
		return err
	})
}
