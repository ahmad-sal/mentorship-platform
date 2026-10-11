# Converter Suite deployment

The public Converter Suite is served by the existing Express application. Deploy with the repository Dockerfile to provide LibreOffice Writer, Calc, and Impress for office-to-PDF rendering. A native Node deployment without `soffice` can still run PDF normalization, Office document reconstruction, and image conversions; office-to-PDF requests return an explicit service-unavailable response.

Document inputs are PDF, DOCX, PPTX, and XLSX (30 MB maximum). Images are JPEG, JPG, PNG, and WebP (20 MB maximum and 40 megapixels). Uploads are held in request memory. Office-to-PDF conversion uses a per-request temporary directory and profile that are removed when conversion finishes or fails. Conversions are limited per process to two document jobs and four image jobs at a time.

LibreOffice renders Office documents to PDF. Conversions between Office formats and PDF-to-Office conversions reconstruct supported text and tables into a new document; they are not layout-preserving exports. PDF table detection is heuristic. Scanned PDFs need OCR, which is not provided. Reconstructed documents do not retain the source's original styling, images, charts, macros, animations, or complex effects. Image conversion decodes and re-encodes through Sharp; transparent inputs use a white background for JPEG/JPG output, and animated images are rejected.
