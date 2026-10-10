# PowerPoint to PDF deployment

PowerPoint conversion runs through LibreOffice Impress on the application server. The uploaded presentation is held in memory while it is validated, then written to a private temporary directory for conversion. The input, isolated LibreOffice profile, and generated PDF are deleted after the request. No third-party conversion service is used.

Deploy this app with the repository `Dockerfile` so the server has LibreOffice Impress and common fonts installed. For Render, select the Docker runtime for the existing web service and keep its existing environment variables and health-check settings. The container listens on the platform-provided `PORT`; `/api/health` remains the health check endpoint. A native Node deployment without LibreOffice returns an explicit `503` for conversion rather than producing a fake PDF.

Only `.pptx` and legacy `.ppt` files are accepted. Rendering uses LibreOffice's Impress PDF export; fonts unavailable on the server may be substituted, and animations, transitions, and some embedded media or effects are not represented in a PDF. Conversion is limited to 50 MB per source, 500 slides per deck, and two concurrent conversions per app process.
