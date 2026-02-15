/* eslint-disable max-lines, no-undef, complexity */
function extractSlideDataFromPage() {
  const PT_PER_PX = 0.75;
  const PX_PER_IN = 96;

  const SINGLE_WEIGHT_FONTS = ['impact'];

  const shouldSkipBold = fontFamily => {
    if (!fontFamily) return false;
    const normalizedFont = fontFamily.toLowerCase().replace(/['"]/g, '').split(',')[0].trim();
    return SINGLE_WEIGHT_FONTS.includes(normalizedFont);
  };

  const pxToInch = px => px / PX_PER_IN;
  const pxToPoints = pxStr => parseFloat(pxStr) * PT_PER_PX;
  const rgbToHex = rgbStr => {
    if (rgbStr === 'rgba(0, 0, 0, 0)' || rgbStr === 'transparent') return 'FFFFFF';

    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return 'FFFFFF';
    return match
      .slice(1)
      .map(n => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  };

  const extractAlpha = rgbStr => {
    const match = rgbStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (!match || !match[4]) return null;
    const alpha = parseFloat(match[4]);
    return Math.round((1 - alpha) * 100);
  };

  const applyTextTransform = (text, textTransform) => {
    if (textTransform === 'uppercase') return text.toUpperCase();
    if (textTransform === 'lowercase') return text.toLowerCase();
    if (textTransform === 'capitalize') {
      return text.replace(/\b\w/g, c => c.toUpperCase());
    }
    return text;
  };

  const getRotation = (transform, writingMode) => {
    let angle = 0;

    if (writingMode === 'vertical-rl') {
      angle = 90;
    } else if (writingMode === 'vertical-lr') {
      angle = 270;
    }

    if (transform && transform !== 'none') {
      const rotateMatch = transform.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
      if (rotateMatch) {
        angle += parseFloat(rotateMatch[1]);
      } else {
        const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
        if (matrixMatch) {
          const values = matrixMatch[1].split(',').map(parseFloat);
          const matrixAngle = Math.atan2(values[1], values[0]) * (180 / Math.PI);
          angle += Math.round(matrixAngle);
        }
      }
    }

    angle = angle % 360;
    if (angle < 0) angle += 360;

    return angle === 0 ? null : angle;
  };

  const getPositionAndSize = (el, rect, rotation) => {
    if (rotation === null) {
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    }

    const isVertical = rotation === 90 || rotation === 270;

    if (isVertical) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      return {
        x: centerX - rect.height / 2,
        y: centerY - rect.width / 2,
        w: rect.height,
        h: rect.width,
      };
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return {
      x: centerX - el.offsetWidth / 2,
      y: centerY - el.offsetHeight / 2,
      w: el.offsetWidth,
      h: el.offsetHeight,
    };
  };

  const parseBoxShadow = boxShadow => {
    if (!boxShadow || boxShadow === 'none') return null;

    const insetMatch = boxShadow.match(/inset/);

    if (insetMatch) return null;

    const colorMatch = boxShadow.match(/rgba?\([^)]+\)/);

    const parts = boxShadow.match(/([-\d.]+)(px|pt)/g);

    if (!parts || parts.length < 2) return null;

    const offsetX = parseFloat(parts[0]);
    const offsetY = parseFloat(parts[1]);
    const blur = parts.length > 2 ? parseFloat(parts[2]) : 0;

    let angle = 0;
    if (offsetX !== 0 || offsetY !== 0) {
      angle = Math.atan2(offsetY, offsetX) * (180 / Math.PI);
      if (angle < 0) angle += 360;
    }

    const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY) * PT_PER_PX;

    let opacity = 0.5;
    if (colorMatch) {
      const opacityMatch = colorMatch[0].match(/[\d.]+\)$/);
      if (opacityMatch) {
        opacity = parseFloat(opacityMatch[0].replace(')', ''));
      }
    }

    return {
      type: 'outer',
      angle: Math.round(angle),
      blur: blur * 0.75, // Convert to points
      color: colorMatch ? rgbToHex(colorMatch[0]) : '000000',
      offset: offset,
      opacity,
    };
  };

  const parseInlineFormatting = (
    element,
    baseOptions = {},
    runs = [],
    baseTextTransform = x => x
  ) => {
    let prevNodeIsText = false;

    element.childNodes.forEach(node => {
      let textTransform = baseTextTransform;

      const isText = node.nodeType === Node.TEXT_NODE || node.tagName === 'BR';
      if (isText) {
        const text =
          node.tagName === 'BR' ? '\n' : textTransform(node.textContent.replace(/\s+/g, ' '));
        const prevRun = runs[runs.length - 1];
        if (prevNodeIsText && prevRun) {
          prevRun.text += text;
        } else {
          runs.push({ text, options: { ...baseOptions } });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim()) {
        const options = { ...baseOptions };
        const computed = window.getComputedStyle(node);

        if (
          node.tagName === 'SPAN' ||
          node.tagName === 'B' ||
          node.tagName === 'STRONG' ||
          node.tagName === 'I' ||
          node.tagName === 'EM' ||
          node.tagName === 'U'
        ) {
          const isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600;
          if (isBold && !shouldSkipBold(computed.fontFamily)) options.bold = true;
          if (computed.fontStyle === 'italic') options.italic = true;
          if (computed.textDecoration && computed.textDecoration.includes('underline'))
            options.underline = true;
          if (computed.color && computed.color !== 'rgb(0, 0, 0)') {
            options.color = rgbToHex(computed.color);
            const transparency = extractAlpha(computed.color);
            if (transparency !== null) options.transparency = transparency;
          }
          if (computed.fontSize) options.fontSize = pxToPoints(computed.fontSize);

          if (computed.textTransform && computed.textTransform !== 'none') {
            const transformStr = computed.textTransform;
            textTransform = text => applyTextTransform(text, transformStr);
          }

          if (computed.marginLeft && parseFloat(computed.marginLeft) > 0) {
            errors.push(
              `Inline element <${node.tagName.toLowerCase()}> has margin-left which is not supported in PowerPoint. Remove margin from inline elements.`
            );
          }
          if (computed.marginRight && parseFloat(computed.marginRight) > 0) {
            errors.push(
              `Inline element <${node.tagName.toLowerCase()}> has margin-right which is not supported in PowerPoint. Remove margin from inline elements.`
            );
          }
          if (computed.marginTop && parseFloat(computed.marginTop) > 0) {
            errors.push(
              `Inline element <${node.tagName.toLowerCase()}> has margin-top which is not supported in PowerPoint. Remove margin from inline elements.`
            );
          }
          if (computed.marginBottom && parseFloat(computed.marginBottom) > 0) {
            errors.push(
              `Inline element <${node.tagName.toLowerCase()}> has margin-bottom which is not supported in PowerPoint. Remove margin from inline elements.`
            );
          }

          parseInlineFormatting(node, options, runs, textTransform);
        }
      }

      prevNodeIsText = isText;
    });

    if (runs.length > 0) {
      runs[0].text = runs[0].text.replace(/^\s+/, '');
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    }

    return runs.filter(r => r.text.length > 0);
  };

  const body = document.body;
  const bodyStyle = window.getComputedStyle(body);
  const bgImage = bodyStyle.backgroundImage;
  const bgColor = bodyStyle.backgroundColor;

  const errors = [];

  if (bgImage && (bgImage.includes('linear-gradient') || bgImage.includes('radial-gradient'))) {
    errors.push(
      'CSS gradients are not supported. Use Sharp to rasterize gradients as PNG images first, ' +
        "then reference with background-image: url('gradient.png')"
    );
  }

  let background;
  if (bgImage && bgImage !== 'none') {
    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch) {
      background = {
        type: 'image',
        path: urlMatch[1],
      };
    } else {
      background = {
        type: 'color',
        value: rgbToHex(bgColor),
      };
    }
  } else {
    background = {
      type: 'color',
      value: rgbToHex(bgColor),
    };
  }

  const elements = [];
  const placeholders = [];
  const textTags = ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI'];
  const processed = new Set();

  document.querySelectorAll('*').forEach(el => {
    if (processed.has(el)) return;

    if (textTags.includes(el.tagName)) {
      const computed = window.getComputedStyle(el);
      const hasBg = computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)';
      const hasBorder =
        (computed.borderWidth && parseFloat(computed.borderWidth) > 0) ||
        (computed.borderTopWidth && parseFloat(computed.borderTopWidth) > 0) ||
        (computed.borderRightWidth && parseFloat(computed.borderRightWidth) > 0) ||
        (computed.borderBottomWidth && parseFloat(computed.borderBottomWidth) > 0) ||
        (computed.borderLeftWidth && parseFloat(computed.borderLeftWidth) > 0);
      const hasShadow = computed.boxShadow && computed.boxShadow !== 'none';

      if (hasBg || hasBorder || hasShadow) {
        errors.push(
          `Text element <${el.tagName.toLowerCase()}> has ${hasBg ? 'background' : hasBorder ? 'border' : 'shadow'}. ` +
            'Backgrounds, borders, and shadows are only supported on <div> elements, not text elements.'
        );
        return;
      }
    }

    if (el.className && el.className.includes('placeholder')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        errors.push(
          `Placeholder "${el.id || 'unnamed'}" has ${rect.width === 0 ? 'width: 0' : 'height: 0'}. Check the layout CSS.`
        );
      } else {
        placeholders.push({
          id: el.id || `placeholder-${placeholders.length}`,
          x: pxToInch(rect.left),
          y: pxToInch(rect.top),
          w: pxToInch(rect.width),
          h: pxToInch(rect.height),
        });
      }
      processed.add(el);
      return;
    }

    if (el.tagName === 'IMG') {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        elements.push({
          type: 'image',
          src: el.src,
          position: {
            x: pxToInch(rect.left),
            y: pxToInch(rect.top),
            w: pxToInch(rect.width),
            h: pxToInch(rect.height),
          },
        });
        processed.add(el);
        return;
      }
    }

    const isContainer = el.tagName === 'DIV' && !textTags.includes(el.tagName);
    if (isContainer) {
      const computed = window.getComputedStyle(el);
      const hasBg = computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)';

      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) {
            errors.push(
              `DIV element contains unwrapped text "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}". ` +
                'All text must be wrapped in <p>, <h1>-<h6>, <ul>, or <ol> tags to appear in PowerPoint.'
            );
          }
        }
      }

      const bgImage = computed.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        errors.push(
          'Background images on DIV elements are not supported. ' +
            'Use solid colors or borders for shapes, or use slide.addImage() in PptxGenJS to layer images.'
        );
        return;
      }

      const borderTop = computed.borderTopWidth;
      const borderRight = computed.borderRightWidth;
      const borderBottom = computed.borderBottomWidth;
      const borderLeft = computed.borderLeftWidth;
      const borders = [borderTop, borderRight, borderBottom, borderLeft].map(
        b => parseFloat(b) || 0
      );
      const hasBorder = borders.some(b => b > 0);
      const hasUniformBorder = hasBorder && borders.every(b => b === borders[0]);
      const borderLines = [];

      if (hasBorder && !hasUniformBorder) {
        const rect = el.getBoundingClientRect();
        const x = pxToInch(rect.left);
        const y = pxToInch(rect.top);
        const w = pxToInch(rect.width);
        const h = pxToInch(rect.height);

        if (parseFloat(borderTop) > 0) {
          const widthPt = pxToPoints(borderTop);
          const inset = widthPt / 72 / 2; // Convert points to inches, then half
          borderLines.push({
            type: 'line',
            x1: x,
            y1: y + inset,
            x2: x + w,
            y2: y + inset,
            width: widthPt,
            color: rgbToHex(computed.borderTopColor),
          });
        }
        if (parseFloat(borderRight) > 0) {
          const widthPt = pxToPoints(borderRight);
          const inset = widthPt / 72 / 2;
          borderLines.push({
            type: 'line',
            x1: x + w - inset,
            y1: y,
            x2: x + w - inset,
            y2: y + h,
            width: widthPt,
            color: rgbToHex(computed.borderRightColor),
          });
        }
        if (parseFloat(borderBottom) > 0) {
          const widthPt = pxToPoints(borderBottom);
          const inset = widthPt / 72 / 2;
          borderLines.push({
            type: 'line',
            x1: x,
            y1: y + h - inset,
            x2: x + w,
            y2: y + h - inset,
            width: widthPt,
            color: rgbToHex(computed.borderBottomColor),
          });
        }
        if (parseFloat(borderLeft) > 0) {
          const widthPt = pxToPoints(borderLeft);
          const inset = widthPt / 72 / 2;
          borderLines.push({
            type: 'line',
            x1: x + inset,
            y1: y,
            x2: x + inset,
            y2: y + h,
            width: widthPt,
            color: rgbToHex(computed.borderLeftColor),
          });
        }
      }

      if (hasBg || hasBorder) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const shadow = parseBoxShadow(computed.boxShadow);

          if (hasBg || hasUniformBorder) {
            elements.push({
              type: 'shape',
              text: '', // Shape only - child text elements render on top
              position: {
                x: pxToInch(rect.left),
                y: pxToInch(rect.top),
                w: pxToInch(rect.width),
                h: pxToInch(rect.height),
              },
              shape: {
                fill: hasBg ? rgbToHex(computed.backgroundColor) : null,
                transparency: hasBg ? extractAlpha(computed.backgroundColor) : null,
                line: hasUniformBorder
                  ? {
                      color: rgbToHex(computed.borderColor),
                      width: pxToPoints(computed.borderWidth),
                    }
                  : null,
                rectRadius: (() => {
                  const radius = computed.borderRadius;
                  const radiusValue = parseFloat(radius);
                  if (radiusValue === 0) return 0;

                  if (radius.includes('%')) {
                    if (radiusValue >= 50) return 1;
                    const minDim = Math.min(rect.width, rect.height);
                    return (radiusValue / 100) * pxToInch(minDim);
                  }

                  if (radius.includes('pt')) return radiusValue / 72;
                  return radiusValue / PX_PER_IN;
                })(),
                shadow: shadow,
              },
            });
          }

          elements.push(...borderLines);

          processed.add(el);
          return;
        }
      }
    }

    if (el.tagName === 'UL' || el.tagName === 'OL') {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const liElements = Array.from(el.querySelectorAll('li'));
      const items = [];
      const ulComputed = window.getComputedStyle(el);
      const ulPaddingLeftPt = pxToPoints(ulComputed.paddingLeft);

      const marginLeft = ulPaddingLeftPt * 0.5;
      const textIndent = ulPaddingLeftPt * 0.5;

      liElements.forEach((li, idx) => {
        const isLast = idx === liElements.length - 1;
        const runs = parseInlineFormatting(li, { breakLine: false });
        if (runs.length > 0) {
          runs[0].text = runs[0].text.replace(/^[•\-*▪▸]\s*/, '');
          runs[0].options.bullet = { indent: textIndent };
        }
        if (runs.length > 0 && !isLast) {
          runs[runs.length - 1].options.breakLine = true;
        }
        items.push(...runs);
      });

      const computed = window.getComputedStyle(liElements[0] || el);

      elements.push({
        type: 'list',
        items: items,
        position: {
          x: pxToInch(rect.left),
          y: pxToInch(rect.top),
          w: pxToInch(rect.width),
          h: pxToInch(rect.height),
        },
        style: {
          fontSize: pxToPoints(computed.fontSize),
          fontFace: computed.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
          color: rgbToHex(computed.color),
          transparency: extractAlpha(computed.color),
          align: computed.textAlign === 'start' ? 'left' : computed.textAlign,
          lineSpacing:
            computed.lineHeight && computed.lineHeight !== 'normal'
              ? pxToPoints(computed.lineHeight)
              : null,
          paraSpaceBefore: 0,
          paraSpaceAfter: pxToPoints(computed.marginBottom),
          margin: [marginLeft, 0, 0, 0],
        },
      });

      liElements.forEach(li => processed.add(li));
      processed.add(el);
      return;
    }

    if (!textTags.includes(el.tagName)) return;

    const rect = el.getBoundingClientRect();
    const text = el.textContent.trim();
    if (rect.width === 0 || rect.height === 0 || !text) return;

    if (el.tagName !== 'LI' && /^[•\-*▪▸○●◆◇■□]\s/.test(text.trimStart())) {
      errors.push(
        `Text element <${el.tagName.toLowerCase()}> starts with bullet symbol "${text.substring(0, 20)}...". ` +
          'Use <ul> or <ol> lists instead of manual bullet symbols.'
      );
      return;
    }

    const computed = window.getComputedStyle(el);
    const rotation = getRotation(computed.transform, computed.writingMode);
    const { x, y, w, h } = getPositionAndSize(el, rect, rotation);

    const baseStyle = {
      fontSize: pxToPoints(computed.fontSize),
      fontFace: computed.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
      color: rgbToHex(computed.color),
      align: computed.textAlign === 'start' ? 'left' : computed.textAlign,
      lineSpacing: pxToPoints(computed.lineHeight),
      paraSpaceBefore: pxToPoints(computed.marginTop),
      paraSpaceAfter: pxToPoints(computed.marginBottom),
      margin: [
        pxToPoints(computed.paddingLeft),
        pxToPoints(computed.paddingRight),
        pxToPoints(computed.paddingBottom),
        pxToPoints(computed.paddingTop),
      ],
    };

    const transparency = extractAlpha(computed.color);
    if (transparency !== null) baseStyle.transparency = transparency;

    if (rotation !== null) baseStyle.rotate = rotation;

    const hasFormatting = el.querySelector('b, i, u, strong, em, span, br');

    if (hasFormatting) {
      const transformStr = computed.textTransform;
      const runs = parseInlineFormatting(el, {}, [], str => applyTextTransform(str, transformStr));

      const adjustedStyle = { ...baseStyle };
      if (adjustedStyle.lineSpacing) {
        const maxFontSize = Math.max(
          adjustedStyle.fontSize,
          ...runs.map(r => r.options?.fontSize || 0)
        );
        if (maxFontSize > adjustedStyle.fontSize) {
          const lineHeightMultiplier = adjustedStyle.lineSpacing / adjustedStyle.fontSize;
          adjustedStyle.lineSpacing = maxFontSize * lineHeightMultiplier;
        }
      }

      elements.push({
        type: el.tagName.toLowerCase(),
        text: runs,
        position: { x: pxToInch(x), y: pxToInch(y), w: pxToInch(w), h: pxToInch(h) },
        style: adjustedStyle,
      });
    } else {
      const textTransform = computed.textTransform;
      const transformedText = applyTextTransform(text, textTransform);

      const isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600;

      elements.push({
        type: el.tagName.toLowerCase(),
        text: transformedText,
        position: { x: pxToInch(x), y: pxToInch(y), w: pxToInch(w), h: pxToInch(h) },
        style: {
          ...baseStyle,
          bold: isBold && !shouldSkipBold(computed.fontFamily),
          italic: computed.fontStyle === 'italic',
          underline: computed.textDecoration.includes('underline'),
        },
      });
    }

    processed.add(el);
  });

  return { background, elements, placeholders, errors };
}

module.exports = { extractSlideDataFromPage };
