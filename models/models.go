package models

import (
	"database/sql/driver"
	"errors"
	"time"

	"gorm.io/gorm"
)

type Config struct {
	gorm.Model
	Key   string `gorm:"uniqueIndex"`
	Value string
}

type Library struct {
	gorm.Model
	Name   string `gorm:"uniqueIndex"`
	Path   string `gorm:"uniqueIndex"`
	Series []Series
}

type Series struct {
	gorm.Model
	Title     string `gorm:"index"`
	Path      string `gorm:"uniqueIndex"`
	Cover     string
	LibraryID uint
	Library   Library `gorm:"foreignKey:LibraryID"`
	Files     []File
	MangaData JSON `gorm:"type:json"`
}

type File struct {
	gorm.Model
	Path        string `gorm:"uniqueIndex"`
	FileFormat  string
	Volume      int
	Chapter     int
	TotalPages  int
	CurrentPage int
	IsRead      bool
	SeriesID    uint
	Series      Series `gorm:"foreignKey:SeriesID"`
}

type MangaData struct {
	MalID          int             `json:"mal_id"`
	URL            string          `json:"url"`
	Images         Images          `json:"images"`
	Approved       bool            `json:"approved"`
	Titles         []Title         `json:"titles"`
	Title          string          `json:"title"`
	TitleEnglish   string          `json:"title_english"`
	TitleJapanese  string          `json:"title_japanese"`
	Type           string          `json:"type"`
	Chapters       int             `json:"chapters"`
	Volumes        int             `json:"volumes"`
	Status         string          `json:"status"`
	Publishing     bool            `json:"publishing"`
	Published      Published       `json:"published"`
	Score          float64         `json:"score"`
	ScoredBy       int             `json:"scored_by"`
	Rank           int             `json:"rank"`
	Popularity     int             `json:"popularity"`
	Members        int             `json:"members"`
	Favorites      int             `json:"favorites"`
	Synopsis       string          `json:"synopsis"`
	Background     string          `json:"background"`
	Authors        []Author        `json:"authors"`
	Serializations []Serialization `json:"serializations"`
	Genres         []Genre         `json:"genres"`
	ExplicitGenres []Genre         `json:"explicit_genres"`
	Themes         []Theme         `json:"themes"`
	Demographics   []Demographic   `json:"demographics"`
}

type JSON []byte

func (j JSON) MarshalJSON() ([]byte, error) {
	if j == nil {
		return []byte("null"), nil
	}
	return j, nil
}

func (j *JSON) UnmarshalJSON(data []byte) error {
	if j == nil {
		return errors.New("null pointer")
	}
	*j = append((*j)[0:0], data...)
	return nil
}

func (j JSON) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSON) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	s, ok := value.([]byte)
	if !ok {
		return errors.New("invalid scan source")
	}
	*j = append((*j)[0:0], s...)
	return nil
}

type Images struct {
	JPG  Image `json:"jpg"`
	WebP Image `json:"webp"`
}

type Image struct {
	ImageURL      string `json:"image_url"`
	SmallImageURL string `json:"small_image_url"`
	LargeImageURL string `json:"large_image_url"`
}

type Title struct {
	Type  string `json:"type"`
	Title string `json:"title"`
}

type Published struct {
	From   time.Time `json:"from"`
	To     time.Time `json:"to"`
	Prop   Prop      `json:"prop"`
	String string    `json:"string"`
}

type Prop struct {
	From From `json:"from"`
	To   To   `json:"to"`
}

type From struct {
	Day   int `json:"day"`
	Month int `json:"month"`
	Year  int `json:"year"`
}

type To struct {
	Day   int `json:"day"`
	Month int `json:"month"`
	Year  int `json:"year"`
}

type Author struct {
	MalID int    `json:"mal_id"`
	Type  string `json:"type"`
	Name  string `json:"name"`
	URL   string `json:"url"`
}

type Serialization struct {
	MalID int    `json:"mal_id"`
	Type  string `json:"type"`
	Name  string `json:"name"`
	URL   string `json:"url"`
}

type Genre struct {
	MalID int    `json:"mal_id"`
	Type  string `json:"type"`
	Name  string `json:"name"`
	URL   string `json:"url"`
}

type Theme struct {
	MalID int    `json:"mal_id"`
	Type  string `json:"type"`
	Name  string `json:"name"`
	URL   string `json:"url"`
}

type Demographic struct {
	MalID int    `json:"mal_id"`
	Type  string `json:"type"`
	Name  string `json:"name"`
	URL   string `json:"url"`
}

type MangaResponse struct {
	Data []MangaData `json:"data"`
}
