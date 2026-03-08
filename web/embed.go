package web

import "embed"

// StaticFS holds the embedded frontend files.
// We use a wildcard to include the dist folder.
// During development, if dist doesn't exist, this might cause build errors.
// It is recommended to run a frontend build at least once or keep a placeholder.
//
//go:embed all:dist
var StaticFS embed.FS
