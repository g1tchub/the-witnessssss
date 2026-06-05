const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const appShell = document.querySelector(".app-shell");
const playArea = document.querySelector(".play-area");
const levelKicker = document.getElementById("levelKicker");
const pairCounter = document.getElementById("pairCounter");
const coverageCounter = document.getElementById("coverageCounter");
const resetButton = document.getElementById("resetButton");
const levelButtons = Array.from(document.querySelectorAll(".level-button"));
const clearPanel = document.getElementById("clearPanel");
const clearTitle = document.getElementById("clearTitle");
const nextButton = document.getElementById("nextButton");
const prizeScreen = document.getElementById("prizeScreen");
const prizeFace = document.getElementById("prizeFace");
const playAgainButton = document.getElementById("playAgainButton");

const TAU = Math.PI * 2;

const COLORS = {
  coral: "#e94f64",
  teal: "#1eb09d",
  amber: "#f2b84b",
  violet: "#7b61ff",
  lime: "#73b84a",
};

const LEVELS = [
  {
    size: 6,
    pairs: [
      { id: "coral", color: COLORS.coral, endpoints: [[0, 0], [4, 5]] },
      { id: "teal", color: COLORS.teal, endpoints: [[3, 5], [4, 1]] },
      { id: "amber", color: COLORS.amber, endpoints: [[4, 2], [2, 3]] },
    ],
  },
  {
    size: 7,
    pairs: [
      { id: "coral", color: COLORS.coral, endpoints: [[0, 0], [6, 6]] },
      { id: "teal", color: COLORS.teal, endpoints: [[5, 6], [1, 1]] },
      { id: "amber", color: COLORS.amber, endpoints: [[2, 1], [1, 5]] },
      { id: "violet", color: COLORS.violet, endpoints: [[1, 4], [3, 3]] },
    ],
  },
  {
    size: 8,
    pairs: [
      { id: "coral", color: COLORS.coral, endpoints: [[0, 0], [7, 5]] },
      { id: "teal", color: COLORS.teal, endpoints: [[7, 6], [0, 3]] },
      { id: "amber", color: COLORS.amber, endpoints: [[0, 2], [6, 6]] },
      { id: "violet", color: COLORS.violet, endpoints: [[5, 6], [5, 2]] },
      { id: "lime", color: COLORS.lime, endpoints: [[5, 3], [3, 4]] },
    ],
  },
];

let levelIndex = 0;
let currentLevel = LEVELS[levelIndex];
let endpointLookup = new Map();
let paths = new Map();
let activePath = null;
let boardPixels = 0;
let cellPixels = 0;
let isClear = false;
let blockedUntil = 0;
let blockedCell = null;

const headImage = new Image();
let headReady = false;
let headSourceIndex = 0;
const headSources = ["assets/head.png", "assets/head.svg"];

function loadHead() {
  headImage.onload = () => {
    headReady = true;
    prizeFace.src = headImage.src;
    draw();
  };
  headImage.onerror = () => {
    headSourceIndex += 1;
    if (headSourceIndex < headSources.length) {
      headImage.src = headSources[headSourceIndex];
    }
  };
  headImage.src = headSources[headSourceIndex];
}

function keyOf(cell) {
  return `${cell[0]},${cell[1]}`;
}

function sameCell(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function buildEndpointLookup() {
  endpointLookup = new Map();
  currentLevel.pairs.forEach((pair) => {
    pair.endpoints.forEach((cell, endpointIndex) => {
      endpointLookup.set(keyOf(cell), { pair, endpointIndex });
    });
  });
}

function loadLevel(nextIndex) {
  prizeScreen.hidden = true;
  levelIndex = nextIndex;
  currentLevel = LEVELS[levelIndex];
  paths = new Map();
  activePath = null;
  isClear = false;
  blockedCell = null;
  buildEndpointLookup();
  updateHud();
  resizeCanvas();
}

function resizeCanvas() {
  fitBoardToScreen();

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  boardPixels = rect.width;
  cellPixels = boardPixels / currentLevel.size;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  draw();
}

function fitBoardToScreen() {
  const shellStyle = window.getComputedStyle(appShell);
  const gap = parseFloat(shellStyle.rowGap) || 14;
  const paddingX = parseFloat(shellStyle.paddingLeft) + parseFloat(shellStyle.paddingRight);
  const paddingY = parseFloat(shellStyle.paddingTop) + parseFloat(shellStyle.paddingBottom);
  const reservedHeight = [...appShell.children]
    .filter((child) => child !== playArea)
    .reduce((total, child) => total + child.getBoundingClientRect().height, 0);
  const availableWidth = appShell.getBoundingClientRect().width - paddingX;
  const availableHeight = window.innerHeight - paddingY - reservedHeight - gap * 3;
  const size = Math.floor(Math.max(250, Math.min(availableWidth, availableHeight)));

  playArea.style.width = `${size}px`;
  playArea.style.height = `${size}px`;
}

function getCellFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    return null;
  }

  const col = Math.min(currentLevel.size - 1, Math.max(0, Math.floor(x / cellPixels)));
  const row = Math.min(currentLevel.size - 1, Math.max(0, Math.floor(y / cellPixels)));
  return [col, row];
}

function startFromEndpoint(endpoint) {
  const origin = endpoint.pair.endpoints[endpoint.endpointIndex];
  const targetIndex = endpoint.endpointIndex === 0 ? 1 : 0;
  const path = {
    pair: endpoint.pair,
    originIndex: endpoint.endpointIndex,
    targetIndex,
    cells: [origin],
    complete: false,
  };

  paths.set(endpoint.pair.id, path);
  activePath = path;
  isClear = false;
  updateHud();
  draw();
}

function startFromExistingPath(cell) {
  const hit = findPathHit(cell);
  if (!hit || hit.path.complete) {
    return false;
  }

  hit.path.cells = hit.path.cells.slice(0, hit.index + 1);
  hit.path.complete = false;
  activePath = hit.path;
  isClear = false;
  updateHud();
  draw();
  return true;
}

function findPathHit(cell) {
  const targetKey = keyOf(cell);

  for (const path of paths.values()) {
    const index = path.cells.findIndex((pathCell) => keyOf(pathCell) === targetKey);
    if (index !== -1) {
      return { path, index };
    }
  }

  return null;
}

function findOtherPathAt(cell, currentPairId) {
  const targetKey = keyOf(cell);

  for (const [pairId, path] of paths.entries()) {
    if (pairId === currentPairId) {
      continue;
    }

    if (path.cells.some((pathCell) => keyOf(pathCell) === targetKey)) {
      return path;
    }
  }

  return null;
}

function onPointerDown(event) {
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);

  const cell = getCellFromPointer(event);
  if (!cell) {
    return;
  }

  const endpoint = endpointLookup.get(keyOf(cell));
  if (endpoint) {
    startFromEndpoint(endpoint);
    return;
  }

  startFromExistingPath(cell);
}

function onPointerMove(event) {
  if (!activePath) {
    return;
  }

  event.preventDefault();
  const cell = getCellFromPointer(event);
  if (!cell) {
    return;
  }

  if (tryAddCell(cell)) {
    updateHud();
    draw();
  }
}

function onPointerUp(event) {
  if (activePath) {
    activePath = null;
    updateHud();
    draw();
  }

  canvas.releasePointerCapture?.(event.pointerId);
}

function tryAddCell(cell) {
  const last = activePath.cells[activePath.cells.length - 1];
  const distance = Math.abs(cell[0] - last[0]) + Math.abs(cell[1] - last[1]);

  if (distance === 0) {
    return false;
  }

  if (distance !== 1) {
    return false;
  }

  const previous = activePath.cells[activePath.cells.length - 2];
  if (previous && sameCell(cell, previous)) {
    activePath.cells.pop();
    activePath.complete = false;
    return true;
  }

  const ownIndex = activePath.cells.findIndex((pathCell) => sameCell(pathCell, cell));
  if (ownIndex !== -1) {
    activePath.cells = activePath.cells.slice(0, ownIndex + 1);
    activePath.complete = false;
    return true;
  }

  if (findOtherPathAt(cell, activePath.pair.id)) {
    pulseBlocked(cell);
    return false;
  }

  const endpoint = endpointLookup.get(keyOf(cell));
  if (endpoint && endpoint.pair.id !== activePath.pair.id) {
    pulseBlocked(cell);
    return false;
  }

  if (endpoint && endpoint.pair.id === activePath.pair.id) {
    if (endpoint.endpointIndex === activePath.originIndex) {
      pulseBlocked(cell);
      return false;
    }

    activePath.cells.push(cell);
    activePath.complete = true;
    activePath = null;
    checkWin();
    return true;
  }

  activePath.cells.push(cell);
  activePath.complete = false;
  return true;
}

function pulseBlocked(cell) {
  blockedCell = cell;
  blockedUntil = performance.now() + 180;

  if ("vibrate" in navigator) {
    navigator.vibrate(8);
  }

  requestAnimationFrame(draw);
}

function getCoverage() {
  const covered = new Set();
  paths.forEach((path) => {
    path.cells.forEach((cell) => covered.add(keyOf(cell)));
  });
  return covered.size;
}

function getCompleteCount() {
  let complete = 0;
  paths.forEach((path) => {
    if (path.complete) {
      complete += 1;
    }
  });
  return complete;
}

function checkWin() {
  const pairsClear = currentLevel.pairs.every((pair) => paths.get(pair.id)?.complete);
  const boardClear = getCoverage() === currentLevel.size * currentLevel.size;
  isClear = pairsClear && boardClear;
  updateHud();
}

function updateHud() {
  const completeCount = getCompleteCount();
  const totalPairs = currentLevel.pairs.length;
  const coverage = Math.round((getCoverage() / (currentLevel.size * currentLevel.size)) * 100);

  levelKicker.textContent = `Level ${levelIndex + 1}`;
  pairCounter.textContent = `${completeCount} / ${totalPairs}`;
  coverageCounter.textContent = `${coverage}%`;
  clearPanel.hidden = !isClear;
  clearTitle.textContent = "Congratulations!";
  nextButton.textContent = levelIndex === LEVELS.length - 1 ? "Claim your prize" : "Next level";

  levelButtons.forEach((button, buttonIndex) => {
    const active = buttonIndex === levelIndex;
    button.classList.toggle("is-active", active);
    if (active) {
      button.setAttribute("aria-current", "true");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function draw() {
  if (!boardPixels || !cellPixels) {
    return;
  }

  ctx.clearRect(0, 0, boardPixels, boardPixels);
  drawBoard();
  drawTails();
  drawSnakes();
  drawEndpoints();
  drawHeads();
  drawBlockedPulse();
}

function drawBoard() {
  const gap = Math.max(3, cellPixels * 0.06);
  const radius = Math.max(5, cellPixels * 0.12);

  ctx.save();
  ctx.fillStyle = "#fbfdfc";
  ctx.fillRect(0, 0, boardPixels, boardPixels);

  for (let row = 0; row < currentLevel.size; row += 1) {
    for (let col = 0; col < currentLevel.size; col += 1) {
      const x = col * cellPixels + gap;
      const y = row * cellPixels + gap;
      const size = cellPixels - gap * 2;
      ctx.fillStyle = (row + col) % 2 === 0 ? "#eef4f1" : "#f6f9f8";
      roundRect(x, y, size, size, radius);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSnakes() {
  currentLevel.pairs.forEach((pair) => {
    const path = paths.get(pair.id);
    if (!path || path.cells.length < 2) {
      return;
    }

    drawSnakePath(path);
  });
}

function drawSnakePath(path) {
  const points = path.cells.map(centerOf);
  const bodyPoints = getBodyPolyline(points);
  const width = getBodyWidth();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowColor = withAlpha(path.pair.color, 0.28);
  ctx.shadowBlur = cellPixels * 0.16;
  ctx.strokeStyle = withAlpha(shadeHex(path.pair.color, -62), 0.7);
  ctx.lineWidth = width + Math.max(2.5, cellPixels * 0.04);
  strokePolyline(bodyPoints);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = shadeHex(path.pair.color, -4);
  ctx.lineWidth = width;
  strokePolyline(bodyPoints);

  ctx.strokeStyle = withAlpha("#fff3cf", 0.2);
  ctx.lineWidth = Math.max(4, width * 0.18);
  strokePolyline(bodyPoints);

  drawSnakePattern(bodyPoints, width);
  ctx.restore();
}

function getBodyWidth() {
  return Math.max(14, cellPixels * 0.36);
}

function getBodyPolyline(points) {
  if (points.length < 2) {
    return points;
  }

  const start = pointBetween(points[0], points[1], 0.52);
  return [start, ...points.slice(1)];
}

function strokePolyline(points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.stroke();
}

function drawSnakePattern(points, bodyWidth) {
  if (points.length < 2) {
    return;
  }

  ctx.save();
  const step = Math.max(9, cellPixels * 0.28);
  let patternIndex = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const marks = Math.max(1, Math.floor(length / step));

    for (let mark = 1; mark <= marks; mark += 1) {
      const t = mark / (marks + 1);
      const x = start.x + dx * t;
      const y = start.y + dy * t;
      const side = patternIndex % 2 === 0 ? -1 : 1;
      const wobble = Math.sin(patternIndex * 1.9) * bodyWidth * 0.08;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      drawDiamondPatch(0, wobble, bodyWidth * 0.42, bodyWidth * 0.2, "rgba(39, 31, 25, 0.5)");
      drawDiamondPatch(bodyWidth * 0.05, side * bodyWidth * 0.28, bodyWidth * 0.26, bodyWidth * 0.12, "rgba(235, 202, 133, 0.6)");
      drawDiamondPatch(-bodyWidth * 0.1, -side * bodyWidth * 0.31, bodyWidth * 0.2, bodyWidth * 0.1, "rgba(33, 27, 23, 0.42)");

      ctx.restore();
      patternIndex += 1;
    }
  }

  ctx.restore();
}

function drawDiamondPatch(x, y, longRadius, shortRadius, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x - longRadius, y);
  ctx.lineTo(x, y - shortRadius);
  ctx.lineTo(x + longRadius, y);
  ctx.lineTo(x, y + shortRadius);
  ctx.closePath();
  ctx.fill();
}

function drawEndpoints() {
  currentLevel.pairs.forEach((pair) => {
    pair.endpoints.forEach((cell) => {
      if (!isPathCapCell(pair.id, cell)) {
        drawEgg(cell, pair.color);
      }
    });
  });
}

function isPathCapCell(pairId, cell) {
  const path = paths.get(pairId);
  if (!path || path.cells.length < 2) {
    return false;
  }

  return sameCell(cell, path.cells[0]) || sameCell(cell, path.cells[path.cells.length - 1]);
}

function drawEgg(cell, color) {
  const center = centerOf(cell);
  const radius = Math.max(14, cellPixels * 0.26);
  const tilt = ((cell[0] * 7 + cell[1] * 5) % 2 === 0 ? -1 : 1) * 0.14;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(tilt);
  ctx.shadowColor = "rgba(17, 20, 22, 0.16)";
  ctx.shadowBlur = cellPixels * 0.08;

  const gradient = ctx.createRadialGradient(-radius * 0.35, -radius * 0.45, radius * 0.1, 0, 0, radius * 1.15);
  gradient.addColorStop(0, shadeHex(color, 46));
  gradient.addColorStop(0.58, color);
  gradient.addColorStop(1, shadeHex(color, -20));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.05, radius * 0.78, radius * 1.02, 0, 0, TAU);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
  ctx.lineWidth = Math.max(3, cellPixels * 0.045);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.36)";
  ctx.beginPath();
  ctx.ellipse(-radius * 0.28, -radius * 0.38, radius * 0.2, radius * 0.28, -0.4, 0, TAU);
  ctx.fill();

  ctx.fillStyle = withAlpha(shadeHex(color, -44), 0.28);
  [
    [-0.18, 0.14, 0.07],
    [0.24, -0.04, 0.05],
    [0.08, 0.36, 0.045],
  ].forEach(([x, y, size]) => {
    ctx.beginPath();
    ctx.arc(radius * x, radius * y, radius * size, 0, TAU);
    ctx.fill();
  });
  ctx.restore();
}

function drawTails() {
  currentLevel.pairs.forEach((pair) => {
    const path = paths.get(pair.id);
    if (path && path.cells.length >= 2) {
      drawRattleTail(path);
    }
  });
}

function drawRattleTail(path) {
  const origin = centerOf(path.cells[0]);
  const next = centerOf(path.cells[1]);
  const angle = Math.atan2(next.y - origin.y, next.x - origin.x);
  const bodyWidth = getBodyWidth();

  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(angle);

  drawTailNeck(bodyWidth, path.pair.color);
  drawRattleSegments(bodyWidth);

  ctx.restore();
}

function drawTailNeck(bodyWidth, color) {
  const baseX = getRattleBaseX();
  const bodyJoinX = cellPixels * 0.58;
  const pointRadius = getRattleBaseRadius(bodyWidth);
  const bodyRadius = bodyWidth / 2;
  const outlineWidth = Math.max(1.2, cellPixels * 0.018);

  ctx.save();
  ctx.shadowColor = "rgba(17, 20, 22, 0.2)";
  ctx.shadowBlur = cellPixels * 0.07;
  ctx.fillStyle = shadeHex(color, -4);
  traceTailNeckPath(baseX, bodyJoinX, pointRadius, bodyRadius);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(shadeHex(color, -66), 0.6);
  ctx.lineWidth = outlineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  traceTailNeckOutline(baseX, bodyJoinX, pointRadius, bodyRadius);
  ctx.stroke();

  ctx.strokeStyle = withAlpha("#fff3cf", 0.18);
  ctx.lineWidth = Math.max(2, bodyWidth * 0.12);
  ctx.beginPath();
  ctx.moveTo(baseX + pointRadius * 0.4, 0);
  ctx.lineTo(bodyJoinX, 0);
  ctx.stroke();
  ctx.restore();
}

function traceTailNeckPath(baseX, bodyJoinX, pointRadius, bodyRadius) {
  ctx.beginPath();
  ctx.moveTo(baseX, -pointRadius);
  ctx.bezierCurveTo(baseX + cellPixels * 0.15, -pointRadius * 1.02, bodyJoinX * 0.58, -bodyRadius, bodyJoinX, -bodyRadius);
  ctx.lineTo(bodyJoinX, bodyRadius);
  ctx.bezierCurveTo(bodyJoinX * 0.58, bodyRadius, baseX + cellPixels * 0.15, pointRadius * 1.02, baseX, pointRadius);
  ctx.quadraticCurveTo(baseX - pointRadius * 0.78, 0, baseX, -pointRadius);
  ctx.closePath();
}

function traceTailNeckOutline(baseX, bodyJoinX, pointRadius, bodyRadius) {
  ctx.beginPath();
  ctx.moveTo(baseX, -pointRadius);
  ctx.bezierCurveTo(baseX + cellPixels * 0.15, -pointRadius * 1.02, bodyJoinX * 0.58, -bodyRadius, bodyJoinX, -bodyRadius);
  ctx.moveTo(bodyJoinX, bodyRadius);
  ctx.bezierCurveTo(bodyJoinX * 0.58, bodyRadius, baseX + cellPixels * 0.15, pointRadius * 1.02, baseX, pointRadius);
}

function drawRattleSegments(bodyWidth) {
  const baseX = getRattleBaseX();
  const baseRadius = getRattleBaseRadius(bodyWidth);
  const ringCount = 5;
  const spacing = cellPixels * 0.075;
  const outlineWidth = Math.max(1.2, cellPixels * 0.018);

  ctx.save();
  ctx.shadowColor = "rgba(17, 20, 22, 0.2)";
  ctx.shadowBlur = cellPixels * 0.06;

  for (let index = 0; index < ringCount; index += 1) {
    const sizeStep = index / (ringCount - 1);
    const x = baseX - spacing * (ringCount - 1 - index);
    const rx = cellPixels * (0.024 + sizeStep * 0.025);
    const ry = baseRadius * (0.48 + sizeStep * 0.52);

    ctx.fillStyle = index % 2 === 0 ? "#d3a75f" : "#f0cd82";
    ctx.strokeStyle = "rgba(87, 58, 31, 0.72)";
    ctx.lineWidth = outlineWidth;
    ctx.beginPath();
    ctx.ellipse(x, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function getRattleBaseX() {
  return -cellPixels * 0.08;
}

function getRattleBaseRadius(bodyWidth) {
  return bodyWidth * 0.24;
}

function drawHeads() {
  currentLevel.pairs.forEach((pair) => {
    const path = paths.get(pair.id);
    if (!path || path.cells.length < 2) {
      return;
    }

    const headCell = path.cells[path.cells.length - 1];
    drawHead(headCell);
  });
}

function drawHead(cell) {
  const center = centerOf(cell);
  const radius = Math.max(17, cellPixels * 0.34);
  const size = radius * 2.18;

  ctx.save();
  ctx.shadowColor = "rgba(17, 20, 22, 0.26)";
  ctx.shadowBlur = cellPixels * 0.14;
  if (headReady) {
    drawImageCover(headImage, center.x - size / 2, center.y - size / 2, size, size);
  } else {
    drawFallbackHead(center, radius);
  }
  ctx.restore();
}

function drawFallbackHead(center, radius) {
  ctx.fillStyle = "#ead3c2";
  ctx.fillRect(center.x - radius, center.y - radius, radius * 2, radius * 2);
  ctx.fillStyle = "#322923";
  ctx.beginPath();
  ctx.arc(center.x - radius * 0.28, center.y - radius * 0.1, radius * 0.09, 0, TAU);
  ctx.arc(center.x + radius * 0.28, center.y - radius * 0.1, radius * 0.09, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "#8d5a4b";
  ctx.lineWidth = Math.max(2, radius * 0.08);
  ctx.beginPath();
  ctx.arc(center.x, center.y + radius * 0.08, radius * 0.35, 0.14 * Math.PI, 0.86 * Math.PI);
  ctx.stroke();
}

function drawBlockedPulse() {
  if (!blockedCell) {
    return;
  }

  const remaining = blockedUntil - performance.now();
  if (remaining <= 0) {
    blockedCell = null;
    return;
  }

  const center = centerOf(blockedCell);
  const progress = 1 - remaining / 180;
  const radius = cellPixels * (0.24 + progress * 0.2);

  ctx.save();
  ctx.strokeStyle = `rgba(17, 20, 22, ${0.22 * (1 - progress)})`;
  ctx.lineWidth = Math.max(3, cellPixels * 0.04);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();

  requestAnimationFrame(draw);
}

function centerOf(cell) {
  return {
    x: cell[0] * cellPixels + cellPixels / 2,
    y: cell[1] * cellPixels + cellPixels / 2,
  };
}

function pointBetween(start, end, amount) {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  };
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawImageCover(image, x, y, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (imageRatio > targetRatio) {
    drawWidth = height * imageRatio;
    drawX = x - (drawWidth - width) / 2;
  } else {
    drawHeight = width / imageRatio;
    drawY = y - (drawHeight - height) / 2;
  }

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function shadeHex(hex, amount) {
  const clamp = (value) => Math.max(0, Math.min(255, value));
  const red = clamp(parseInt(hex.slice(1, 3), 16) + amount);
  const green = clamp(parseInt(hex.slice(3, 5), 16) + amount);
  const blue = clamp(parseInt(hex.slice(5, 7), 16) + amount);
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function withAlpha(hex, alpha) {
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

resetButton.addEventListener("click", () => loadLevel(levelIndex));
nextButton.addEventListener("click", () => {
  if (levelIndex === LEVELS.length - 1 && isClear) {
    prizeScreen.hidden = false;
  } else {
    loadLevel(levelIndex + 1);
  }
});
playAgainButton.addEventListener("click", () => loadLevel(0));

levelButtons.forEach((button) => {
  button.addEventListener("click", () => {
    loadLevel(Number(button.dataset.level));
  });
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", resizeCanvas);

loadHead();
buildEndpointLookup();
updateHud();
requestAnimationFrame(resizeCanvas);
