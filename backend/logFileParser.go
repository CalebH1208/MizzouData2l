package logFileParser

import (
	"log"
	"os"
)

func OpenAndPrintFile(path string) string {
	file, err := os.Open(path)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	data := make([]byte, 20)
	count, err := file.Read(data)
	if err != nil {
		log.Fatal(err)
	}
	if count < 20 {
		return "get a longer file"
	}
	return "First 20 chars:" + string(data)
}
