(() => {
  // ---------- Constants ----------
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;          
  const NEXT_CELL = 24;     

  const SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]],
    J: [[1, 0, 0], [1, 1, 1]],
    L: [[0, 0, 1], [1, 1, 1]],
  };

  const COLORS = {
    I: "#4cc9f0", O: "#ffd166", T: "#c77dff",
    S: "#06d6a0", Z: "#ef476f", J: "#5b8cff", L: "#ff9f43",
  };

  const TYPES = Object.keys(SHAPES);

  const WEIGHTS = {
    height: -0.510066, holes: -0.35663, bumpiness: -0.184483, lineClears: 0.760666,
  };

  // ---------- Sounds ----------
  const sounds = {
    drop: new Audio('drop.mp3'),
    clear: new Audio('clear.mp3'),
    gameover: new Audio('gameover.mp3')
  };

  function playSound(sound) {
    sound.currentTime = 0; // сброс, чтобы можно было играть быстро подряд
    sound.play().catch(e => console.log("Audio play blocked:", e));
  }

  // ---------- DOM ----------
  const canvas = document.getElementById("board");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("next");
  const nctx = nextCanvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const linesEl = document.getElementById("lines");
  const levelEl = document.getElementById("level");
  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");
  const overlay = document.getElementById("overlay");
  const finalScoreEl = document.getElementById("finalScore");
  const overlayRestart = document.getElementById("overlayRestart");

  // ---------- State ----------
  let board, current, nextPiece, score, linesCleared, level, paused, gameOver;
  let dropTimer = 0, dropInterval = 150, lastTime = 0;
  let botDelay = 0;         
  let currentPlan = null;   

  function createEmptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function randomPiece() {
    const type = TYPES[(Math.random() * TYPES.length) | 0];
    return makePiece(type);
  }

  function makePiece(type) {
    return { type, matrix: SHAPES[type].map((row) => row.slice()) };
  }

  function rotate(matrix, dir = 1) {
    const n = matrix.length;
    const m = matrix[0].length;
    const out = Array.from({ length: m }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < m; c++) {
        if (dir > 0) out[c][n - 1 - r] = matrix[r][c];
        else out[m - 1 - c][r] = matrix[r][c];
      }
    }
    return out;
  }

  function allRotations(matrix) {
    const variants = [];
    let cur = matrix.map((r) => r.slice());
    for (let i = 0; i < 4; i++) {
      variants.push(cur);
      cur = rotate(cur, 1);
    }
    return variants;
  }

  function collides(boardState, matrix, offsetX, offsetY) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const x = offsetX + c;
        const y = offsetY + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && boardState[y][x]) return true;
      }
    }
    return false;
  }

  function boardHeights(b) {
    const heights = Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (b[r][c]) {
          heights[c] = ROWS - r;
          break;
        }
      }
    }
    return heights;
  }

  function countHoles(b) {
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let seenBlock = false;
      for (let r = 0; r < ROWS; r++) {
        if (b[r][c]) seenBlock = true;
        else if (seenBlock) holes++;
      }
    }
    return holes;
  }

  function aggregateHeight(b) {
    return boardHeights(b).reduce((a, v) => a + v, 0);
  }

  function bumpiness(b) {
    const h = boardHeights(b);
    let sum = 0;
    for (let i = 0; i < COLS - 1; i++) sum += Math.abs(h[i] - h[i + 1]);
    return sum;
  }

  function scoreBoard(b, clearedLines) {
    return (
      WEIGHTS.height * aggregateHeight(b) +
      WEIGHTS.holes * countHoles(b) +
      WEIGHTS.bumpiness * bumpiness(b) +
      WEIGHTS.lineClears * clearedLines
    );
  }

  function simulatePlacement(b, matrix, x) {
    let y = 0;
    while (!collides(b, matrix, x, y + 1)) y++;
    if (collides(b, matrix, x, y)) return null;

    const clone = b.map((row) => row.slice());
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (!matrix[r][c]) continue;
        const yy = y + r;
        const xx = x + c;
        if (yy >= 0) clone[yy][xx] = matrix[r][c];
      }
    }
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (clone[r].every((cell) => cell)) {
        clone.splice(r, 1);
        clone.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }
    return { board: clone, cleared };
  }

  function findBestMove(b, piece) {
    const rotations = allRotations(piece.matrix);
    let best = null;
    rotations.forEach((matrix, rotation) => {
      const width = matrix[0].length;
      for (let x = 0; x <= COLS - width; x++) {
        if (collides(b, matrix, x, 0)) continue;
        const sim = simulatePlacement(b, matrix, x);
        if (!sim) continue;
        const value = scoreBoard(sim.board, sim.cleared);
        if (!best || value > best.value) {
          best = { value, rotation, x, matrix };
        }
      }
    });
    return best;
  }

  function applyBestMove() {
    if (currentPlan === null) return false;
    const target = currentPlan;

    const desired = target.matrix;
    if (!matricesEqual(current.matrix, desired)) {
      const rotated = rotate(current.matrix, 1);
      if (!collides(board, rotated, current.x, current.y)) {
        current.matrix = rotated;
        return true;
      }
    }

    if (current.x < target.x) {
      if (!collides(board, current.matrix, current.x + 1, current.y)) {
        current.x++;
        return true;
      }
    } else if (current.x > target.x) {
      if (!collides(board, current.matrix, current.x - 1, current.y)) {
        current.x--;
        return true;
      }
    }

    if (!collides(board, current.matrix, current.x, current.y + 1)) {
      current.y++;
      return true;
    }
    return false;
  }

  function matricesEqual(a, b) {
    if (a.length !== b.length || a[0].length !== b[0].length) return false;
    for (let r = 0; r < a.length; r++)
      for (let c = 0; c < a[r].length; c++)
        if (a[r][c] !== b[r][c]) return false;
    return true;
  }

  function spawnPiece() {
    current = {
      ...nextPiece,
      x: Math.floor((COLS - nextPiece.matrix[0].length) / 2),
      y: 0,
    };
    nextPiece = randomPiece();
    currentPlan = findBestMove(board, current);
    drawNext();

    if (collides(board, current.matrix, current.x, current.y)) {
      endGame();
    }
  }

  function lockPiece() {
    playSound(sounds.drop); // ЗВУК: фигура приземлилась

    for (let r = 0; r < current.matrix.length; r++) {
      for (let c = 0; c < current.matrix[r].length; c++) {
        if (!current.matrix[r][c]) continue;
        const y = current.y + r;
        const x = current.x + c;
        if (y >= 0) board[y][x] = current.type;
      }
    }

    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every((cell) => cell)) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
        r++;
      }
    }

    if (cleared > 0) {
      playSound(sounds.clear); // ЗВУК: линия собрана
      linesCleared += cleared;
      score += [0, 100, 300, 500, 800][cleared] * level;
      level = Math.floor(linesCleared / 10) + 1;
      dropInterval = Math.max(40, 150 - (level - 1) * 12);
      updateUI();
    }

    spawnPiece();
  }

  function endGame() {
    gameOver = true;
    playSound(sounds.gameover); // ЗВУК: конец игры
    finalScoreEl.textContent = score;
    overlay.classList.remove("hidden");
  }

  function drawCell(context, x, y, color, size, alpha = 1) {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size - 1, size - 1);
    context.globalAlpha = 1;
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, canvas.height);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(canvas.width, r * CELL);
      ctx.stroke();
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawCell(ctx, c, r, COLORS[board[r][c]], CELL);
        }
      }
    }

    if (current && !gameOver) {
      for (let r = 0; r < current.matrix.length; r++) {
        for (let c = 0; c < current.matrix[r].length; c++) {
          if (!current.matrix[r][c]) continue;
          const y = current.y + r;
          if (y < 0) continue;
          drawCell(ctx, current.x + c, y, COLORS[current.type], CELL);
        }
      }
    }
  }

  function drawNext() {
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) return;
    const m = nextPiece.matrix;
    const offsetX = (nextCanvas.width - m[0].length * NEXT_CELL) / 2;
    const offsetY = (nextCanvas.height - m.length * NEXT_CELL) / 2;
    for (let r = 0; r < m.length; r++) {
      for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        nctx.fillStyle = COLORS[nextPiece.type];
        nctx.fillRect(
          offsetX + c * NEXT_CELL,
          offsetY + r * NEXT_CELL,
          NEXT_CELL - 1,
          NEXT_CELL - 1
        );
      }
    }
  }

  function updateUI() {
    scoreEl.textContent = score;
    linesEl.textContent = linesCleared;
    levelEl.textContent = level;
  }

  function gameLoop(time = 0) {
    const dt = time - lastTime;
    lastTime = time;

    if (!paused && !gameOver) {
      dropTimer += dt;
      botDelay += dt;

      if (botDelay >= 90) {
        botDelay = 0;
        const moved = applyBestMove();
        if (!moved) {
          lockPiece();
        }
      }

      if (dropTimer >= dropInterval) {
        dropTimer = 0;
        if (!collides(board, current.matrix, current.x, current.y + 1)) {
          current.y++;
        } else {
          lockPiece();
        }
      }
    }

    drawBoard();
    requestAnimationFrame(gameLoop);
  }

  function reset() {
    board = createEmptyBoard();
    score = 0;
    linesCleared = 0;
    level = 1;
    dropInterval = 150;
    paused = false;
    gameOver = false;
    dropTimer = 0;
    botDelay = 0;
    lastTime = 0;
    overlay.classList.add("hidden");
    pauseBtn.textContent = "Pause";
    nextPiece = randomPiece();
    spawnPiece();
    updateUI();
    drawNext();
  }

  pauseBtn.addEventListener("click", () => {
    if (gameOver) return;
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
  });

  restartBtn.addEventListener("click", reset);
  overlayRestart.addEventListener("click", reset);

  reset();
  requestAnimationFrame(gameLoop);
})();
