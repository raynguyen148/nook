(() => {
  "use strict";

  const SAFE_LINK_SCHEME = /^(?:https?:|mailto:|tel:)/i;
  const SAFE_RELATIVE_LINK = /^(?:[./#?]|$)/;

  function createElement(tagName, className) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    return element;
  }

  function appendText(parent, text) {
    if (text) parent.append(document.createTextNode(text));
  }

  function findClosingDelimiter(source, start, delimiter) {
    const closingIndex = source.indexOf(delimiter, start);
    return closingIndex === -1 ? -1 : closingIndex;
  }

  function isSafeLink(value) {
    const url = value.trim();
    if (!url || /[\u0000-\u0020]/.test(url)) return false;
    return SAFE_LINK_SCHEME.test(url) || SAFE_RELATIVE_LINK.test(url);
  }

  function appendInline(parent, source) {
    let index = 0;
    let textStart = 0;

    const flushText = (end) => {
      appendText(parent, source.slice(textStart, end));
    };

    const appendNested = (tagName, content, className = "") => {
      const element = createElement(tagName, className);
      appendInline(element, content);
      parent.append(element);
    };

    while (index < source.length) {
      const character = source[index];

      if (character === "\\" && /[\\`*_{}[\]()#+.!\-~]/.test(source[index + 1] || "")) {
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
          appendText(code, source.slice(index + runLength, closingIndex).trim());
          parent.append(code);
          index = closingIndex + runLength;
          textStart = index;
          continue;
        }
      }

      if (source.startsWith("![", index)) {
        const imageEnd = source.indexOf(")", index + 2);
        const imageMatch = imageEnd !== -1 && source.slice(index, imageEnd + 1).match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imageMatch) {
          flushText(index);
          // Images are intentionally represented by their alt text. This keeps
          // note rendering offline and avoids loading untrusted remote assets.
          appendNested("span", imageMatch[1], "markdown-image-alt");
          index = imageEnd + 1;
          textStart = index;
          continue;
        }
      }

      if (character === "[") {
        const labelEnd = source.indexOf("](", index + 1);
        if (labelEnd !== -1) {
          const linkEnd = source.indexOf(")", labelEnd + 2);
          const label = source.slice(index + 1, labelEnd);
          const url = source.slice(labelEnd + 2, linkEnd === -1 ? source.length : linkEnd).trim();
          if (linkEnd !== -1 && label && isSafeLink(url)) {
            flushText(index);
            const link = createElement("a");
            link.href = url;
            link.rel = "noreferrer noopener";
            link.target = "_blank";
            appendInline(link, label);
            parent.append(link);
            index = linkEnd + 1;
            textStart = index;
            continue;
          }
        }
      }

      if (source.startsWith("<http", index) || source.startsWith("<mailto:", index)) {
        const autolinkEnd = source.indexOf(">", index + 1);
        const url = source.slice(index + 1, autolinkEnd === -1 ? source.length : autolinkEnd);
        if (autolinkEnd !== -1 && isSafeLink(url)) {
          flushText(index);
          const link = createElement("a");
          link.href = url;
          link.rel = "noreferrer noopener";
          link.target = "_blank";
          appendText(link, url);
          parent.append(link);
          index = autolinkEnd + 1;
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
        const content = closingIndex === -1 ? "" : source.slice(index + delimiter.length, closingIndex);
        const canUseUnderscore = delimiter !== "_" || !(/[\p{L}\p{N}]/u.test(source[index - 1] || "") || /[\p{L}\p{N}]/u.test(source[closingIndex + 1] || ""));
        if (closingIndex > index + delimiter.length && canUseUnderscore) {
          flushText(index);
          appendNested(tagName, content);
          index = closingIndex + delimiter.length;
          textStart = index;
          continue;
        }
      }

      index += 1;
    }

    flushText(source.length);
  }

  function appendParagraph(parent, lines) {
    const paragraph = createElement("p");
    lines.forEach((line, index) => {
      if (index) paragraph.append(document.createElement("br"));
      appendInline(paragraph, line);
    });
    parent.append(paragraph);
  }

  function appendCodeBlock(parent, codeLines, language = "") {
    const pre = createElement("pre");
    const code = createElement("code");
    if (language) code.dataset.language = language;
    appendText(code, codeLines.join("\n"));
    pre.append(code);
    parent.append(pre);
  }

  function appendList(parent, lines, startIndex, ordered) {
    const list = createElement(ordered ? "ol" : "ul");
    let index = startIndex;
    while (index < lines.length) {
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
      const match = lines[index].match(pattern);
      if (!match) break;
      const item = createElement("li");
      appendInline(item, match[1]);
      list.append(item);
      index += 1;
    }
    parent.append(list);
    return index;
  }

  function appendBlocks(parent, source) {
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    let index = 0;
    let paragraphLines = [];

    const flushParagraph = () => {
      if (paragraphLines.length) {
        appendParagraph(parent, paragraphLines);
        paragraphLines = [];
      }
    };

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        flushParagraph();
        index += 1;
        continue;
      }

      const fence = line.match(/^\s*(```+|~~~+)\s*([^ ]*)\s*$/);
      if (fence) {
        flushParagraph();
        const fenceMarker = fence[1][0];
        const codeLines = [];
        index += 1;
        while (index < lines.length && !new RegExp(`^\\s*${fenceMarker}{${fence[1].length},}\\s*$`).test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        appendCodeBlock(parent, codeLines, fence[2]);
        continue;
      }

      const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flushParagraph();
        const element = createElement(`h${heading[1].length}`);
        appendInline(element, heading[2]);
        parent.append(element);
        index += 1;
        continue;
      }

      if (/^\s{0,3}(?:\*\s*){3,}$/.test(line) || /^\s{0,3}(?:-\s*){3,}$/.test(line) || /^\s{0,3}(?:_\s*){3,}$/.test(line)) {
        flushParagraph();
        parent.append(createElement("hr"));
        index += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        flushParagraph();
        const quoteLines = [];
        while (index < lines.length && /^\s*>/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
          index += 1;
        }
        const quote = createElement("blockquote");
        appendBlocks(quote, quoteLines.join("\n"));
        parent.append(quote);
        continue;
      }

      if (/^\s*[-+*]\s+/.test(line)) {
        flushParagraph();
        index = appendList(parent, lines, index, false);
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        flushParagraph();
        index = appendList(parent, lines, index, true);
        continue;
      }

      paragraphLines.push(line);
      index += 1;
    }

    flushParagraph();
  }

  function renderInto(container, source, emptyText = "No content yet.") {
    container.replaceChildren();
    if (!String(source ?? "").trim()) {
      const empty = createElement("p", "markdown-empty");
      appendText(empty, emptyText);
      container.append(empty);
      return;
    }
    appendBlocks(container, String(source));
  }

  globalThis.NookMarkdown = Object.freeze({ renderInto });
})();
