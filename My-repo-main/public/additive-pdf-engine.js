(function (root, factory) {
  var engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (root) root.AdditivePdfEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function color(hex, pdfLib) {
    var value = String(hex || '#000000').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error('Choose a valid color.');
    return pdfLib.rgb(
      parseInt(value.slice(0, 2), 16) / 255,
      parseInt(value.slice(2, 4), 16) / 255,
      parseInt(value.slice(4, 6), 16) / 255
    );
  }

  function decodeDataUrl(dataUrl) {
    var match = /^data:image\/(?:png|jpeg);base64,([a-z0-9+/=]+)$/i.exec(dataUrl || '');
    if (!match) throw new Error('An image could not be prepared for PDF export.');
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(match[1], 'base64'));
    var binary = atob(match[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function point(pageInfo, x, y) {
    var m = pageInfo.transform;
    var determinant = m[0] * m[3] - m[1] * m[2];
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 0.000001) {
      throw new Error('The PDF page coordinate system could not be read.');
    }
    var screenX = x * pageInfo.width;
    var screenY = y * pageInfo.height;
    var dx = screenX - m[4];
    var dy = screenY - m[5];
    return {
      x: (m[3] * dx - m[2] * dy) / determinant,
      y: (m[0] * dy - m[1] * dx) / determinant
    };
  }

  function length(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  function polygonPath(points) {
    return points.map(function (point, index) {
      return (index ? 'L ' : 'M ') + point.x + ' ' + -point.y;
    }).join(' ') + ' Z';
  }

  function fontFor(pdfLib, object) {
    var family = object.fontFamily === 'Times' ? 'TimesRoman' :
      object.fontFamily === 'Courier' ? 'Courier' : 'Helvetica';
    var base = family;
    if (family === 'TimesRoman') {
      if (object.bold && object.italic) base += 'BoldItalic';
      else if (object.bold) base += 'Bold';
      else if (object.italic) base += 'Italic';
    } else if (object.bold && object.italic) base += 'BoldOblique';
    else if (object.bold) base += 'Bold';
    else if (object.italic) base += 'Oblique';
    return pdfLib.StandardFonts[base] || pdfLib.StandardFonts.Helvetica;
  }

  function wrapText(text, font, size, maxWidth) {
    var lines = [];
    String(text || '').split(/\r?\n/).forEach(function (paragraph) {
      var words = paragraph.split(/\s+/);
      var line = '';
      words.forEach(function (word) {
        var candidate = line ? line + ' ' + word : word;
        if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
          lines.push(line);
          line = word;
        } else line = candidate;
      });
      lines.push(line);
    });
    return lines;
  }

  async function applyChanges(sourceBytes, pageModels, pdfLib) {
    if (!pdfLib || !pdfLib.PDFDocument) throw new Error('The PDF editing library is unavailable.');
    var pdf = await pdfLib.PDFDocument.load(sourceBytes, { updateMetadata: false });
    var pages = pdf.getPages();
    for (var pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      var page = pages[pageIndex];
      var info = pageModels[pageIndex];
      if (!info) continue;
      var objects = info.objects || [];
      for (var i = 0; i < objects.length; i += 1) {
        var object = objects[i];
        var opacity = Math.max(0, Math.min(1, Number(object.opacity === undefined ? 1 : object.opacity)));
        var topLeft = point(info, object.x, object.y);
        var bottomRight = point(info, object.x + object.w, object.y + object.h);
        var visualRight = point(info, object.x + object.w, object.y);
        var visualDown = point(info, object.x, object.y + object.h);
        var width = Math.max(0.1, length(topLeft, visualRight));
        var height = Math.max(0.1, length(topLeft, visualDown));
        var strokeWidth = Math.max(0.1, Number(object.strokeWidth) || 1);

        if (object.type === 'text') {
          var font = await pdf.embedFont(fontFor(pdfLib, object));
          var size = Math.max(1, Number(object.fontSize) || 18);
          var rotation = pdfLib.degrees(Number(info.rotation) || 0);
          var padding = 2;
          if (object.backgroundOpacity > 0) {
            page.drawSvgPath(polygonPath([
              topLeft,
              visualRight,
              bottomRight,
              visualDown
            ]), {
              x: 0,
              y: 0,
              color: color(object.backgroundColor, pdfLib),
              opacity: Math.max(0, Math.min(1, Number(object.backgroundOpacity))),
              borderWidth: 0
            });
          }
          var lines = wrapText(object.text, font, size, Math.max(1, width - padding * 2));
          var lineHeight = size * 1.25;
          try {
            lines.forEach(function (line) { font.encodeText(line); });
          } catch (error) {
            throw new Error('The selected standard PDF font cannot encode one or more characters. Use common Latin characters.');
          }
          lines.forEach(function (line, lineIndex) {
            var lineWidth = font.widthOfTextAtSize(line, size);
            var horizontalOffset = padding;
            if (object.align === 'center') horizontalOffset += Math.max(0, (width - lineWidth - padding * 2) / 2);
            if (object.align === 'right') horizontalOffset += Math.max(0, width - lineWidth - padding * 2);
            var baselineScreenX = object.x + horizontalOffset / info.width;
            var baselineScreenY = object.y + (size + padding + lineIndex * lineHeight) / info.height;
            var baseline = point(info, baselineScreenX, baselineScreenY);
            page.drawText(line, {
              x: baseline.x,
              y: baseline.y,
              size: size,
              font: font,
              color: color(object.color, pdfLib),
              opacity: opacity,
              rotate: rotation
            });
            if (object.underline) {
              var underlineStart = point(info, baselineScreenX, baselineScreenY + 1.5 / info.height);
              var underlineEnd = point(info, baselineScreenX + lineWidth / info.width, baselineScreenY + 1.5 / info.height);
              page.drawLine({
                start: underlineStart,
                end: underlineEnd,
                thickness: Math.max(0.5, size / 18),
                color: color(object.color, pdfLib),
                opacity: opacity
              });
            }
          });
        } else if (object.type === 'image') {
          var imageBytes = decodeDataUrl(object.dataUrl);
          var image = object.dataUrl.indexOf('data:image/jpeg') === 0
            ? await pdf.embedJpg(imageBytes)
            : await pdf.embedPng(imageBytes);
          var imageRotation = ((Number(info.rotation) || 0) % 360 + 360) % 360;
          var imageX = Math.min(topLeft.x, bottomRight.x);
          var imageY = Math.min(topLeft.y, bottomRight.y);
          var imageWidth = imageRotation === 90 || imageRotation === 270 ? height : width;
          var imageHeight = imageRotation === 90 || imageRotation === 270 ? width : height;
          if (imageRotation === 90) imageX += width;
          else if (imageRotation === 180) {
            imageX += width;
            imageY += height;
          } else if (imageRotation === 270) imageY += height;
          page.drawImage(image, {
            x: imageX,
            y: imageY,
            width: imageWidth,
            height: imageHeight,
            opacity: opacity,
            rotate: pdfLib.degrees(imageRotation)
          });
        } else if (object.type === 'draw') {
          var strokeColor = color(object.color, pdfLib);
          var points = object.points || [];
          for (var pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
            page.drawLine({
              start: point(info, object.x + points[pointIndex - 1].x * object.w, object.y + points[pointIndex - 1].y * object.h),
              end: point(info, object.x + points[pointIndex].x * object.w, object.y + points[pointIndex].y * object.h),
              thickness: strokeWidth,
              color: strokeColor,
              opacity: opacity
            });
          }
        } else if (object.type === 'line' || object.type === 'arrow') {
          var start = point(info, object.reverseX ? object.x + object.w : object.x, object.reverseY ? object.y + object.h : object.y);
          var end = point(info, object.reverseX ? object.x : object.x + object.w, object.reverseY ? object.y : object.y + object.h);
          page.drawLine({ start: start, end: end, thickness: strokeWidth, color: color(object.color, pdfLib), opacity: opacity });
          if (object.type === 'arrow') {
            var angle = Math.atan2(end.y - start.y, end.x - start.x);
            var head = Math.max(5, strokeWidth * 4);
            [angle + Math.PI * 0.82, angle - Math.PI * 0.82].forEach(function (side) {
              page.drawLine({
                start: end,
                end: { x: end.x + Math.cos(side) * head, y: end.y + Math.sin(side) * head },
                thickness: strokeWidth,
                color: color(object.color, pdfLib),
                opacity: opacity
              });
            });
          }
        } else if (object.type === 'rectangle') {
          var rectangleOptions = {
            x: 0,
            y: 0,
            borderColor: color(object.color, pdfLib),
            borderWidth: strokeWidth,
            borderOpacity: opacity
          };
          var fillOpacity = object.fillOpacity === undefined ? opacity : Number(object.fillOpacity);
          if (object.fillColor && fillOpacity > 0) {
            rectangleOptions.color = color(object.fillColor, pdfLib);
            rectangleOptions.opacity = Math.max(0, Math.min(1, fillOpacity));
          }
          page.drawSvgPath(polygonPath([
            topLeft,
            visualRight,
            bottomRight,
            visualDown
          ]), rectangleOptions);
        } else if (object.type === 'circle') {
          var center = point(info, object.x + object.w / 2, object.y + object.h / 2);
          var circleOptions = {
            x: center.x,
            y: center.y,
            xScale: width / 2,
            yScale: height / 2,
            borderColor: color(object.color, pdfLib),
            borderWidth: strokeWidth,
            borderOpacity: opacity
          };
          var fillOpacity = object.fillOpacity === undefined ? opacity : Number(object.fillOpacity);
          if (object.fillColor && fillOpacity > 0) {
            circleOptions.color = color(object.fillColor, pdfLib);
            circleOptions.opacity = Math.max(0, Math.min(1, fillOpacity));
          }
          page.drawEllipse(circleOptions);
        } else if (object.type === 'triangle') {
          var p1 = point(info, object.x + object.w / 2, object.y);
          var p2 = point(info, object.x + object.w, object.y + object.h);
          var p3 = point(info, object.x, object.y + object.h);
          var trianglePath = polygonPath([p1, p2, p3]);
          var triangleOptions = {
            x: 0,
            y: 0,
            borderColor: color(object.color, pdfLib),
            borderWidth: strokeWidth,
            borderOpacity: opacity
          };
          var fillOpacity = object.fillOpacity === undefined ? opacity : Number(object.fillOpacity);
          if (object.fillColor && fillOpacity > 0) {
            triangleOptions.color = color(object.fillColor, pdfLib);
            triangleOptions.opacity = Math.max(0, Math.min(1, fillOpacity));
          }
          page.drawSvgPath(trianglePath, triangleOptions);
        }
      }
    }
    return pdf.save();
  }

  return { applyChanges: applyChanges, point: point };
});
