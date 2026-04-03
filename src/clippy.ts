/** Wrap text into lines of max `width` characters */
function wordWrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) { lines.push(""); continue; }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      if (line.length + word.length + 1 > width && line.length > 0) {
        lines.push(line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function buildTextHouse(text: string, maxWidth: number): string[] {
  if (maxWidth < 10) return [];

  const lines = wordWrap(text, maxWidth - 4);
  const padded = lines.map(l => l.padEnd(maxWidth - 4));

  let edgeChars = ['/', '\\', '\\', '/'];
  let frameChar = '_';
  let contentChar = '|';

  let frame: string[] = [
    (' ' + frameChar.repeat(maxWidth - 2) + ' '),
    (edgeChars[0] + ' '.repeat(maxWidth - 2) + edgeChars[1])
  ];

  for (const entry of padded) {
    frame.push(contentChar + ' ' + entry + ' ' + contentChar);
  }

  frame.push(edgeChars[2] + frameChar.repeat(maxWidth - 2) + edgeChars[3]);
  return [...frame];
}

/** Vertically center two column arrays side-by-side */
function joinColumns(left: string[], right: string[], gap: number): string[] {
  const leftWidth = Math.max(...left.map(l => l.length), 0);
  const rightWidth = Math.max(...right.map(l => l.length), 0);
  const rows = Math.max(left.length, right.length);
  const leftPad = Math.floor((rows - left.length) / 2);
  const rightPad = Math.floor((rows - right.length) / 2);
  const spacer = ' '.repeat(gap);
  const result: string[] = [];
  for (let i = 0; i < rows; i++) {
    const l = (left[i - leftPad] ?? '').padEnd(leftWidth);
    const r = (right[i - rightPad] ?? '').padEnd(rightWidth);
    result.push(l + spacer + r);
  }
  return result;
}

const CLIPPY_ART = [
  " ___",
  "/   \\",
  "|   |",
  "@   @",
  "|| ||",
  "|| ||",
  "|\\_/|",
  "\\___/"
];

function cowsay(text: string, maxWidth = 30): string {
  const clippyWidth = Math.max(...CLIPPY_ART.map(l => l.length));
  const spacing = 3;
  const textHouse = buildTextHouse(text, maxWidth - clippyWidth - spacing);
  return joinColumns(CLIPPY_ART, textHouse, spacing).join('\n');
}

const STORAGE_KEY = "bb-clippy-closed";
const MESSAGE = "it looks like you're doing some serious reverse engineering! wanna try out bb for the terminal?";

export function initClippy(): void {
  // Single element that morphs between circle and expanded rect
  const box = document.createElement("div");
  box.id = "clippy-box";
  document.body.appendChild(box);

  // Circle label (the "?")
  const qmark = document.createElement("span");
  qmark.className = "clippy-qmark";
  qmark.textContent = "?";
  box.appendChild(qmark);

  // Content (hidden until expanded)
  const content = document.createElement("div");
  content.className = "clippy-content";

  const closeBtn = document.createElement("button");
  closeBtn.className = "clippy-close";
  closeBtn.textContent = "x";
  closeBtn.title = "close";

  const pre = document.createElement("pre");
  pre.className = "clippy-ascii";
  pre.textContent = cowsay(MESSAGE, 50);

  const link = document.createElement("a");
  link.href = "https://github.com/cristeigabriela/bb";
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "clippy-link";
  link.textContent = "> github.com/cristeigabriela/bb";

  content.appendChild(closeBtn);
  content.appendChild(pre);
  content.appendChild(link);
  box.appendChild(content);

  // Compute expanded size from the cowsay text dimensions.
  // Each character is ~8.4px wide in Courier New at 0.7rem (9.8px),
  // and line-height is 1.25 * font-size.
  const asciiText = pre.textContent!;
  const asciiLines = asciiText.split("\n");
  const maxCols = Math.max(...asciiLines.map(l => l.length));
  const charW = 5.95; // approximate ch width at 0.7rem Courier New
  const lineH = 12.25; // approximate line height
  const padX = 10 * 2 + 2; // content padding + border
  const padY = 10 * 2 + 2 + 24; // content padding + border + link + close btn
  const expandedWidth = Math.ceil(maxCols * charW + padX);
  const expandedHeight = Math.ceil(asciiLines.length * lineH + padY);

  box.style.setProperty("--exp-w", expandedWidth + "px");
  box.style.setProperty("--exp-h", expandedHeight + "px");

  const wasClosed = localStorage.getItem(STORAGE_KEY) === "1";
  let isAnimating = false;

  function expand() {
    if (isAnimating) return;
    isAnimating = true;
    localStorage.removeItem(STORAGE_KEY);
    // Hide "?" immediately, then morph shape
    qmark.classList.add("hidden");
    // Force a reflow so the browser registers the current (circle) size
    // before we add the expanded class to trigger the transition
    box.offsetHeight;
    box.classList.add("expanded");
    // After shape morph completes, fade in content
    setTimeout(() => {
      content.classList.add("visible");
      isAnimating = false;
    }, 380);
  }

  function collapse() {
    if (isAnimating) return;
    isAnimating = true;
    localStorage.setItem(STORAGE_KEY, "1");
    // Fade out content first
    content.classList.remove("visible");
    setTimeout(() => {
      // Then morph shape back to circle
      box.classList.remove("expanded");
      setTimeout(() => {
        // Then show "?"
        qmark.classList.remove("hidden");
        isAnimating = false;
      }, 380);
    }, 250);
  }

  box.addEventListener("click", (e) => {
    if (!box.classList.contains("expanded")) expand();
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapse();
  });

  if (wasClosed) {
    // Start as circle — no animation needed
  } else {
    setTimeout(() => expand(), 1500);
  }
}
