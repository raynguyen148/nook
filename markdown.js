(() => {
  "use strict";

  const SAFE_LINK_SCHEME = /^(?:https?:|mailto:|tel:)/i;
  const SAFE_RELATIVE_LINK = /^(?:[./#?]|$)/;
  const ESCAPABLE_PUNCTUATION = /[\\`*_{}[\]()#+.\-!~|>]/;
  const ALERT_TYPES = new Set(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);
  const HTML_ENTITIES = Object.freeze({
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    ldquo: "“",
    lsquo: "‘",
    mdash: "—",
    nbsp: "\u00a0",
    ndash: "–",
    quot: '"',
    rdquo: "”",
    rsquo: "’",
  });

  function createElement(tagName, className = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
  }

  function appendText(parent, text) {
    if (text) parent.append(document.createTextNode(text));
  }

  function decodeEntity(entity) {
    const named = entity.slice(1, -1);
    if (HTML_ENTITIES[named]) return HTML_ENTITIES[named];
    const numeric = named.match(/^#(x[\da-f]+|\d+)$/i);
    if (numeric) {
      const codePoint = numeric[1].toLowerCase().startsWith("x")
        ? Number.parseInt(numeric[1].slice(1), 16)
        : Number.parseInt(numeric[1], 10);
      if (Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      }
    }
    return entity;
  }

  function appendDecodedText(parent, text) {
    let start = 0;
    const entityPattern = /&(?:#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi;
    let match = entityPattern.exec(text);
    while (match) {
      appendText(parent, text.slice(start, match.index));
      appendText(parent, decodeEntity(match[0]));
      start = match.index + match[0].length;
      match = entityPattern.exec(text);
    }
    appendText(parent, text.slice(start));
  }

  function unescapeMarkdown(value) {
    return value.replace(/\\([\\`*_{}[\]()#+.\-!~|>])/g, "$1");
  }

  function normalizeReferenceLabel(value) {
    return unescapeMarkdown(value).trim().replace(/[\t\r\n ]+/g, " ").toLocaleLowerCase();
  }

  function normalizeLines(source) {
    return String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  }

  function countIndent(line) {
    const match = line.match(/^[ \t]*/);
    return (match?.[0] || "").replace(/\t/g, "    ").length;
  }

  function isSafeLink(value) {
    const url = unescapeMarkdown(value).trim();
    if (!url || /[\u0000-\u0020]/.test(url)) return false;
    if (/^www\./i.test(url)) return true;
    return SAFE_LINK_SCHEME.test(url) || SAFE_RELATIVE_LINK.test(url);
  }

  function findMatchingPair(source, start, opening, closing) {
    let depth = 0;
    let index = start;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index] === opening) depth += 1;
      if (source[index] === closing) {
        depth -= 1;
        if (depth === 0) return index;
      }
      index += 1;
    }
    return -1;
  }

  function findClosingDelimiter(source, start, delimiter) {
    let index = start;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source.startsWith(delimiter, index)) return index;
      index += 1;
    }
    return -1;
  }

  function parseLinkDestination(body) {
    const value = body.trim();
    if (!value) return null;
    let url = "";
    let remainder = "";
    if (value.startsWith("<")) {
      const end = value.indexOf(">");
      if (end === -1) return null;
      url = value.slice(1, end);
      remainder = value.slice(end + 1).trim();
    } else {
      const match = value.match(/^(\S+)/);
      if (!match) return null;
      url = match[1];
      remainder = value.slice(match[1].length).trim();
    }
    const titleMatch = remainder.match(/^(?:"([^"]*)"|'([^']*)'|\(([^)]*)\))$/);
    return { url: unescapeMarkdown(url), title: titleMatch ? titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] : "" };
  }

  function makeLink(label, destination, context) {
    if (!destination || !isSafeLink(destination.url)) return null;
    const link = createElement("a");
    const url = unescapeMarkdown(destination.url).trim();
    link.href = url.startsWith("www.") ? `https://${url}` : url;
    link.rel = "noreferrer noopener";
    link.target = "_blank";
    if (destination.title) link.title = destination.title;
    const plainLabel = label === destination.url || label === unescapeMarkdown(destination.url) || label === destination.url.replace(/^mailto:/i, "");
    if (plainLabel) appendDecodedText(link, label);
    else appendInline(link, label, context);
    return link;
  }

  function parseInlineLinkAt(source, index, context) {
    const labelStart = source[index] === "!" ? index + 1 : index;
    if (source[labelStart] !== "[") return null;
    const labelEnd = findMatchingPair(source, labelStart, "[", "]");
    if (labelEnd === -1) return null;
    const label = source.slice(labelStart + 1, labelEnd);
    const afterLabel = labelEnd + 1;
    if (source[afterLabel] === "(") {
      const destinationEnd = findMatchingPair(source, afterLabel, "(", ")");
      if (destinationEnd === -1) return null;
      const destination = parseLinkDestination(source.slice(afterLabel + 1, destinationEnd));
      return destination ? { end: destinationEnd + 1, label, destination } : null;
    }
    let referenceEnd = afterLabel;
    let referenceLabel = label;
    if (source[afterLabel] === "[") {
      const end = findMatchingPair(source, afterLabel, "[", "]");
      if (end === -1) return null;
      referenceEnd = end + 1;
      referenceLabel = source.slice(afterLabel + 1, end) || label;
    }
    const reference = context.references.get(normalizeReferenceLabel(referenceLabel));
    if (!reference) return null;
    return { end: referenceEnd, label, destination: reference };
  }

  function trimAutolinkPunctuation(value) {
    let result = value;
    while (/[.,!?;:]$/.test(result)) result = result.slice(0, -1);
    if (result.endsWith(")") && (result.match(/\(/g) || []).length < (result.match(/\)/g) || []).length) {
      result = result.slice(0, -1);
    }
    return result;
  }

  function parseAutolinkAt(source, index) {
    const previous = source[index - 1] || "";
    if (previous && !/[\s([<{]/.test(previous)) return null;
    const value = source.slice(index);
    const urlMatch = value.match(/^(?:https?:\/\/|www\.)[^\s<>]+/i);
    if (urlMatch) {
      const raw = trimAutolinkPunctuation(urlMatch[0]);
      if (raw && isSafeLink(raw)) return { end: index + raw.length, label: raw, url: raw };
    }
    const emailMatch = value.match(/^[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    if (emailMatch) {
      const email = emailMatch[0];
      return { end: index + email.length, label: email, url: `mailto:${email}` };
    }
    return null;
  }

  function appendInline(parent, source, context) {
    let index = 0;
    let textStart = 0;

    const flushText = (end) => {
      appendDecodedText(parent, source.slice(textStart, end));
    };

    const appendNested = (tagName, content, className = "") => {
      const element = createElement(tagName, className);
      appendInline(element, content, context);
      parent.append(element);
    };

    while (index < source.length) {
      const character = source[index];

      if (character === "\\" && ESCAPABLE_PUNCTUATION.test(source[index + 1] || "")) {
        flushText(index);
        appendText(parent, source[index + 1]);
        index += 2;
        textStart = index;
        continue;
      }

      if (character === "`") {
        let runLength = 1;
        while (source[index + runLength] === "`") runLength += 1;
        const delimiter = "`".repeat(runLength);
        const closingIndex = findClosingDelimiter(source, index + runLength, delimiter);
        if (closingIndex !== -1) {
          flushText(index);
          const code = createElement("code");
          appendText(code, source.slice(index + runLength, closingIndex).replace(/\n/g, " ").trim());
          parent.append(code);
          index = closingIndex + runLength;
          textStart = index;
          continue;
        }
      }

      if (character === "!" && source[index + 1] === "[") {
        const image = parseInlineLinkAt(source, index, context);
        if (image) {
          flushText(index);
          const imageAlt = createElement("span", "markdown-image-alt");
          imageAlt.setAttribute("role", "img");
          imageAlt.setAttribute("aria-label", `Image: ${image.label || "untitled"}`);
          appendText(imageAlt, image.label || "Image");
          parent.append(imageAlt);
          index = image.end;
          textStart = index;
          continue;
        }
      }

      if (character === "[") {
        if (source[index + 1] === "^") {
          const footnoteEnd = source.indexOf("]", index + 2);
          const footnoteLabel = footnoteEnd === -1 ? "" : source.slice(index + 2, footnoteEnd);
          if (footnoteLabel && context.footnotes.has(normalizeReferenceLabel(footnoteLabel))) {
            flushText(index);
            const normalizedLabel = normalizeReferenceLabel(footnoteLabel);
            const number = registerFootnote(context, normalizedLabel);
            const referenceCount = context.footnoteReferenceCounts.get(normalizedLabel) || 0;
            context.footnoteReferenceCounts.set(normalizedLabel, referenceCount + 1);
            const sup = createElement("sup", "markdown-footnote-ref");
            const link = createElement("a");
            link.href = `#fn-${footnoteSlug(normalizedLabel)}`;
            link.id = `fnref-${footnoteSlug(normalizedLabel)}-${referenceCount + 1}`;
            link.textContent = `[${number}]`;
            sup.append(link);
            parent.append(sup);
            index = footnoteEnd + 1;
            textStart = index;
            continue;
          }
        }
        const link = parseInlineLinkAt(source, index, context);
        if (link) {
          flushText(index);
          const element = makeLink(link.label, link.destination, context);
          if (element) parent.append(element);
          else appendDecodedText(parent, source.slice(index, link.end));
          index = link.end;
          textStart = index;
          continue;
        }
      }

      if (character === "<") {
        const closingIndex = source.indexOf(">", index + 1);
        if (closingIndex !== -1) {
          const candidate = source.slice(index + 1, closingIndex);
          const url = candidate.match(/^(?:https?:\/\/|mailto:)[^\s<>]+$/i) ? candidate : null;
          const email = candidate.match(/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i);
          if (url || email) {
            flushText(index);
            const link = makeLink(candidate, { url: url || `mailto:${candidate}` }, context);
            if (link) parent.append(link);
            index = closingIndex + 1;
            textStart = index;
            continue;
          }
        }
      }

      if ((character === "h" && source.startsWith("http", index)) || (character === "w" && source.startsWith("www.", index)) || /[\w.+-]/.test(character)) {
        const autolink = parseAutolinkAt(source, index);
        if (autolink) {
          flushText(index);
          const link = makeLink(autolink.label, { url: autolink.url }, context);
          if (link) parent.append(link);
          index = autolink.end;
          textStart = index;
          continue;
        }
      }

      if (character === "$" && source[index + 1] !== "$" && !/\s/.test(source[index + 1] || "")) {
        const closingIndex = findClosingDelimiter(source, index + 1, "$");
        if (closingIndex > index + 1 && !/\s/.test(source[closingIndex - 1] || "")) {
          flushText(index);
          const math = createElement("span", "markdown-math");
          math.setAttribute("aria-label", "Mathematical expression");
          appendText(math, source.slice(index + 1, closingIndex));
          parent.append(math);
          index = closingIndex + 1;
          textStart = index;
          continue;
        }
      }

      const formatting = [
        ["**", "strong"],
        ["__", "strong"],
        ["~~", "del"],
        ["*", "em"],
        ["_", "em"],
      ].find(([delimiter]) => source.startsWith(delimiter, index));
      if (formatting) {
        const [delimiter, tagName] = formatting;
        const closingIndex = findClosingDelimiter(source, index + delimiter.length, delimiter);
        const previous = source[index - 1] || "";
        const next = source[index + delimiter.length] || "";
        const closingNext = closingIndex === -1 ? "" : source[closingIndex + delimiter.length] || "";
        const underscoreIsValid = delimiter !== "_" || (!/[\p{L}\p{N}]/u.test(previous) && !/[\p{L}\p{N}]/u.test(closingNext));
        if (closingIndex > index + delimiter.length && next !== " " && underscoreIsValid) {
          flushText(index);
          appendNested(tagName, source.slice(index + delimiter.length, closingIndex));
          index = closingIndex + delimiter.length;
          textStart = index;
          continue;
        }
      }

      index += 1;
    }

    flushText(source.length);
  }

  function appendInlineLines(parent, lines, context) {
    lines.forEach((line, index) => {
      let value = line;
      const hardBreak = / {2,}$/.test(value) || /\\$/.test(value);
      if (hardBreak) value = value.replace(/ {2,}$|\\$/, "");
      appendInline(parent, value, context);
      if (index < lines.length - 1) parent.append(document.createElement("br"));
      else if (hardBreak) parent.append(document.createElement("br"));
    });
  }

  function appendParagraph(parent, lines, context) {
    const paragraph = createElement("p");
    appendInlineLines(paragraph, lines, context);
    parent.append(paragraph);
  }

  function appendCodeBlock(parent, codeLines, language = "") {
    const pre = createElement("pre");
    const code = createElement("code");
    const normalizedLanguage = language.trim().split(/[\s,]+/)[0].replace(/[^a-z\d_-]/gi, "");
    if (normalizedLanguage) {
      code.dataset.language = normalizedLanguage;
      code.classList.add(`language-${normalizedLanguage.toLowerCase()}`);
    }
    appendText(code, codeLines.join("\n"));
    pre.append(code);
    parent.append(pre);
  }

  function getListMarker(line) {
    const match = line.match(/^(\s{0,3})([-+*]|\d+[.)])[ \t]+(.*)$/);
    if (!match) return null;
    return {
      content: match[3],
      indent: match[1].replace(/\t/g, "    ").length,
      marker: match[2],
      ordered: /^\d/.test(match[2]),
      start: /^\d/.test(match[2]) ? Number.parseInt(match[2], 10) : 1,
    };
  }

  function parseList(lines, startIndex, context) {
    const first = getListMarker(lines[startIndex]);
    const items = [];
    let index = startIndex;
    let itemHasBlankBefore = false;
    while (index < lines.length) {
      const marker = getListMarker(lines[index]);
      if (!marker || marker.indent !== first.indent || marker.ordered !== first.ordered) break;
      const itemLines = [marker.content];
      const task = marker.content.match(/^\[([ xX])\][ \t]+(.*)$/);
      if (task) itemLines[0] = task[2];
      index += 1;
      let sawBlank = false;

      while (index < lines.length) {
        const nextMarker = getListMarker(lines[index]);
        if (nextMarker && nextMarker.indent === first.indent && nextMarker.ordered === first.ordered) break;
        if (nextMarker && nextMarker.indent < first.indent) break;
        if (!lines[index].trim()) {
          itemLines.push("");
          sawBlank = true;
          index += 1;
          continue;
        }
        const indent = countIndent(lines[index]);
        if (sawBlank && indent <= first.indent) break;
        if (sawBlank && indent >= first.indent + 4) break;
        if (indent > first.indent) {
          const strip = Math.min(lines[index].length, first.indent + 2);
          itemLines.push(lines[index].slice(strip));
        } else {
          itemLines.push(lines[index].trim());
        }
        index += 1;
      }
      items.push({
        checked: task ? task[1].toLocaleLowerCase() === "x" : null,
        spacedBefore: itemHasBlankBefore,
        children: parseBlocks(itemLines, context),
      });
      itemHasBlankBefore = sawBlank;
    }
    return {
      block: { type: "list", items, ordered: first.ordered, start: first.start },
      nextIndex: index,
    };
  }

  function hasUnescapedPipe(line) {
    let inCode = 0;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === "\\") {
        index += 1;
        continue;
      }
      if (line[index] === "`") {
        let run = 1;
        while (line[index + run] === "`") run += 1;
        inCode = inCode === run ? 0 : inCode || run;
        index += run - 1;
        continue;
      }
      if (line[index] === "|" && !inCode) return true;
    }
    return false;
  }

  function splitTableRow(line) {
    let value = line.trim();
    if (value.startsWith("|")) value = value.slice(1);
    if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
    const cells = [];
    let start = 0;
    let inCode = 0;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === "\\") {
        index += 1;
        continue;
      }
      if (value[index] === "`") {
        let run = 1;
        while (value[index + run] === "`") run += 1;
        inCode = inCode === run ? 0 : inCode || run;
        index += run - 1;
        continue;
      }
      if (value[index] === "|" && !inCode) {
        cells.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
    cells.push(value.slice(start).trim());
    return cells;
  }

  function parseTableDelimiter(line) {
    if (!hasUnescapedPipe(line)) return null;
    const cells = splitTableRow(line);
    if (!cells.length || cells.some((cell) => !/^:?-{3,}:?$/.test(cell))) return null;
    return cells.map((cell) => {
      const left = cell.startsWith(":");
      const right = cell.endsWith(":");
      return left && right ? "center" : right ? "right" : "left";
    });
  }

  function parseTableAt(lines, index) {
    if (!hasUnescapedPipe(lines[index]) || index + 1 >= lines.length) return null;
    const alignments = parseTableDelimiter(lines[index + 1]);
    if (!alignments) return null;
    const header = splitTableRow(lines[index]);
    if (header.length < 2 || alignments.length < 2) return null;
    const rows = [];
    let nextIndex = index + 2;
    while (nextIndex < lines.length && lines[nextIndex].trim() && hasUnescapedPipe(lines[nextIndex])) {
      rows.push(splitTableRow(lines[nextIndex]));
      nextIndex += 1;
    }
    const normalizeRow = (row) => row.slice(0, header.length).concat(Array(Math.max(0, header.length - row.length)).fill(""));
    return {
      block: { type: "table", alignments: alignments.slice(0, header.length), header: normalizeRow(header), rows: rows.map(normalizeRow) },
      nextIndex,
    };
  }

  function parseReferenceDefinition(line) {
    const match = line.match(/^\s{0,3}\[([^\]^]+)\]:[ \t]*(?:<([^>]+)>|(\S+))(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/);
    if (!match) return null;
    return {
      label: normalizeReferenceLabel(match[1]),
      url: unescapeMarkdown(match[2] || match[3] || ""),
      title: match[4] ?? match[5] ?? match[6] ?? "",
    };
  }

  function extractDefinitions(lines, context) {
    const result = [];
    let fenceMarker = "";
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const fence = line.match(/^\s*(`{3,}|~{3,})\s*/);
      if (fenceMarker) {
        if (line.match(new RegExp(`^\\s*${fenceMarker[0]}{${fenceMarker.length},}\\s*$`))) fenceMarker = "";
        result.push(line);
        continue;
      }
      if (fence) {
        fenceMarker = fence[1];
        result.push(line);
        continue;
      }
      const footnote = line.match(/^\s{0,3}\[\^([^\]]+)\]:[ \t]*(.*)$/);
      if (footnote) {
        const body = [footnote[2]];
        index += 1;
        while (index < lines.length) {
          if (/^ {4}/.test(lines[index])) {
            body.push(lines[index].slice(4));
            index += 1;
          } else if (!lines[index].trim() && /^ {4}/.test(lines[index + 1] || "")) {
            body.push("");
            index += 1;
          } else {
            break;
          }
        }
        context.footnotes.set(normalizeReferenceLabel(footnote[1]), body);
        index -= 1;
        continue;
      }
      const reference = parseReferenceDefinition(line);
      if (reference) {
        context.references.set(reference.label, { url: reference.url, title: reference.title });
        continue;
      }
      result.push(line);
    }
    return result;
  }

  function isThematicBreak(line) {
    return /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
  }

  function isAtxHeading(line) {
    return /^\s{0,3}#{1,6}(?:[ \t]+|$)/.test(line);
  }

  function isSetextHeading(lines, index) {
    return Boolean(lines[index]?.trim() && lines[index + 1] && /^\s{0,3}(?:=+|-+)\s*$/.test(lines[index + 1]));
  }

  function isDetailsStart(line) {
    return /^\s{0,3}<details(?:\s[^>]*)?>\s*$/i.test(line);
  }

  function isBlockStart(lines, index) {
    const line = lines[index] || "";
    return Boolean(
      /^\s*(`{3,}|~{3,})/.test(line) ||
        isDetailsStart(line) ||
        isAtxHeading(line) ||
        isThematicBreak(line) ||
        /^\s{0,3}>/.test(line) ||
        getListMarker(line) ||
        /^ {4}/.test(line) ||
        isSetextHeading(lines, index) ||
        parseTableAt(lines, index),
    );
  }

  function parseBlocks(lines, context) {
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = line.match(/^\s*(`{3,}|~{3,})\s*([^ ]*)\s*$/);
      if (fence) {
        const marker = fence[1][0];
        const markerLength = fence[1].length;
        const codeLines = [];
        index += 1;
        while (index < lines.length && !new RegExp(`^\\s*${marker}{${markerLength},}\\s*$`).test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        blocks.push({ type: "code", language: fence[2], lines: codeLines });
        continue;
      }

      if (/^\s*\$\$\s*$/.test(line)) {
        const mathLines = [];
        index += 1;
        while (index < lines.length && !/^\s*\$\$\s*$/.test(lines[index])) {
          mathLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        blocks.push({ type: "math", lines: mathLines });
        continue;
      }

      if (isDetailsStart(line)) {
        const body = [];
        let end = index + 1;
        while (end < lines.length && !/^\s{0,3}<\/details>\s*$/i.test(lines[end])) {
          body.push(lines[end]);
          end += 1;
        }
        if (end < lines.length) {
          let summary = "Details";
          if (/^\s*<summary>[\s\S]*<\/summary>\s*$/i.test(body[0] || "")) {
            summary = body.shift().replace(/^\s*<summary>/i, "").replace(/<\/summary>\s*$/i, "");
          }
          blocks.push({ type: "details", open: /\sopen(?:\s|>)/i.test(line), summary, children: parseBlocks(body, context) });
          index = end + 1;
          continue;
        }
      }

      if (/^\s{0,3}#{1,6}(?:[ \t]+|$)/.test(line)) {
        const heading = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+(.*)|$)/);
        const text = (heading[2] || "").replace(/[ \t]+#+[ \t]*$/, "").trim();
        blocks.push({ type: "heading", level: heading[1].length, lines: [text] });
        index += 1;
        continue;
      }

      if (isSetextHeading(lines, index)) {
        blocks.push({ type: "heading", level: lines[index + 1].trim().startsWith("=") ? 1 : 2, lines: [line.trim()] });
        index += 2;
        continue;
      }

      const table = parseTableAt(lines, index);
      if (table) {
        blocks.push(table.block);
        index = table.nextIndex;
        continue;
      }

      if (isThematicBreak(line)) {
        blocks.push({ type: "hr" });
        index += 1;
        continue;
      }

      if (/^\s{0,3}>/.test(line)) {
        const quoteLines = [];
        while (index < lines.length) {
          if (/^\s{0,3}>/.test(lines[index])) {
            quoteLines.push(lines[index].replace(/^\s{0,3}>[ \t]?/, ""));
            index += 1;
          } else if (!lines[index].trim()) {
            quoteLines.push("");
            index += 1;
          } else {
            break;
          }
        }
        const alert = quoteLines[0]?.match(/^\[!([A-Z]+)\]\s*$/i);
        if (alert && ALERT_TYPES.has(alert[1].toUpperCase())) {
          blocks.push({ type: "alert", kind: alert[1].toLowerCase(), children: parseBlocks(quoteLines.slice(1), context) });
        } else {
          blocks.push({ type: "blockquote", children: parseBlocks(quoteLines, context) });
        }
        continue;
      }

      if (getListMarker(line)) {
        const list = parseList(lines, index, context);
        blocks.push(list.block);
        index = list.nextIndex;
        continue;
      }

      if (/^ {4}/.test(line)) {
        const codeLines = [];
        while (index < lines.length && (/^ {4}/.test(lines[index]) || !lines[index].trim())) {
          codeLines.push(lines[index].startsWith("    ") ? lines[index].slice(4) : "");
          index += 1;
        }
        while (codeLines.at(-1) === "") codeLines.pop();
        blocks.push({ type: "code", language: "", lines: codeLines });
        continue;
      }

      const paragraphLines = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
        paragraphLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "paragraph", lines: paragraphLines });
    }
    return blocks;
  }

  function footnoteSlug(label) {
    return label.replace(/[^a-z\d_-]+/gi, "-").replace(/^-+|-+$/g, "") || "note";
  }

  function registerFootnote(context, label) {
    if (!context.footnoteOrder.includes(label)) context.footnoteOrder.push(label);
    return context.footnoteOrder.indexOf(label) + 1;
  }

  function renderTable(parent, block, context) {
    const wrapper = createElement("div", "markdown-table-wrapper");
    const table = createElement("table", "markdown-table");
    const thead = createElement("thead");
    const headerRow = createElement("tr");
    block.header.forEach((cell, index) => {
      const header = createElement("th");
      header.scope = "col";
      header.dataset.align = block.alignments[index] || "left";
      appendInline(header, cell, context);
      headerRow.append(header);
    });
    thead.append(headerRow);
    table.append(thead);
    if (block.rows.length) {
      const tbody = createElement("tbody");
      block.rows.forEach((row) => {
        const tableRow = createElement("tr");
        row.forEach((cell, index) => {
          const dataCell = createElement("td");
          dataCell.dataset.align = block.alignments[index] || "left";
          appendInline(dataCell, cell, context);
          tableRow.append(dataCell);
        });
        tbody.append(tableRow);
      });
      table.append(tbody);
    }
    wrapper.append(table);
    parent.append(wrapper);
  }

  function renderList(parent, block, context) {
    const list = createElement(block.ordered ? "ol" : "ul");
    if (block.ordered && block.start !== 1) list.start = block.start;
    block.items.forEach((item) => {
      const listItem = createElement("li");
      if (item.spacedBefore) listItem.classList.add("markdown-list-item--spaced");
      const children = item.children;
      if (item.checked !== null) {
        listItem.classList.add("markdown-task-item");
        const checkbox = createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.checked;
        checkbox.disabled = true;
        checkbox.setAttribute("aria-label", item.checked ? "Completed task" : "Incomplete task");
        listItem.append(checkbox);
        const first = children.shift();
        if (first?.type === "paragraph") {
          const taskContent = createElement("span", "markdown-task-content");
          appendInlineLines(taskContent, first.lines, context);
          listItem.append(taskContent);
        } else if (first) {
          renderBlock(listItem, first, context);
        }
      }
      renderBlocks(listItem, children, context);
      list.append(listItem);
    });
    parent.append(list);
  }

  function renderFootnotes(parent, context) {
    if (!context.footnoteOrder.length) return;
    const section = createElement("section", "markdown-footnotes");
    section.setAttribute("aria-label", "Footnotes");
    const heading = createElement("h4");
    heading.textContent = "Footnotes";
    section.append(heading);
    const list = createElement("ol");
    context.footnoteOrder.forEach((label) => {
      const item = createElement("li");
      item.id = `fn-${footnoteSlug(label)}`;
      renderBlocks(item, parseBlocks(context.footnotes.get(label) || [], context), context);
      const back = createElement("a", "markdown-footnote-backref");
      back.href = `#fnref-${footnoteSlug(label)}-1`;
      back.textContent = " ↩";
      back.setAttribute("aria-label", "Back to footnote reference");
      item.append(back);
      list.append(item);
    });
    section.append(list);
    parent.append(section);
  }

  function renderBlock(parent, block, context) {
    if (block.type === "paragraph") return appendParagraph(parent, block.lines, context);
    if (block.type === "heading") {
      const heading = createElement(`h${block.level}`);
      appendInlineLines(heading, block.lines, context);
      parent.append(heading);
      return;
    }
    if (block.type === "code") return appendCodeBlock(parent, block.lines, block.language);
    if (block.type === "math") {
      const math = createElement("div", "markdown-math markdown-math--block");
      math.setAttribute("aria-label", "Mathematical expression");
      appendText(math, block.lines.join("\n"));
      parent.append(math);
      return;
    }
    if (block.type === "hr") {
      parent.append(createElement("hr"));
      return;
    }
    if (block.type === "table") return renderTable(parent, block, context);
    if (block.type === "list") return renderList(parent, block, context);
    if (block.type === "blockquote") {
      const quote = createElement("blockquote");
      renderBlocks(quote, block.children, context);
      parent.append(quote);
      return;
    }
    if (block.type === "alert") {
      const alert = createElement("aside", `markdown-alert markdown-alert--${block.kind}`);
      alert.setAttribute("role", block.kind === "warning" || block.kind === "caution" ? "alert" : "note");
      const title = createElement("p", "markdown-alert__title");
      title.textContent = block.kind[0].toLocaleUpperCase() + block.kind.slice(1);
      alert.append(title);
      renderBlocks(alert, block.children, context);
      parent.append(alert);
      return;
    }
    if (block.type === "details") {
      const details = createElement("details", "markdown-details");
      if (block.open) details.open = true;
      const summary = createElement("summary");
      appendInline(summary, block.summary, context);
      details.append(summary);
      renderBlocks(details, block.children, context);
      parent.append(details);
    }
  }

  function renderBlocks(parent, blocks, context) {
    blocks.forEach((block) => renderBlock(parent, block, context));
  }

  function renderInto(container, source, emptyText = "No content yet.") {
    container.replaceChildren();
    const text = String(source ?? "");
    if (!text.trim()) {
      const empty = createElement("p", "markdown-empty");
      appendText(empty, emptyText);
      container.append(empty);
      return;
    }
    const context = {
      footnoteOrder: [],
      footnoteReferenceCounts: new Map(),
      footnotes: new Map(),
      references: new Map(),
    };
    const lines = extractDefinitions(normalizeLines(text), context);
    renderBlocks(container, parseBlocks(lines, context), context);
    renderFootnotes(container, context);
  }

  globalThis.NookMarkdown = Object.freeze({ renderInto });
})();
