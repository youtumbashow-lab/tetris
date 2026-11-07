(() => {
  // ---------- Constants ----------
  const COLS = 10;
  const ROWS = 20;
  const CELL = 26;

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

  // ---------- Sounds (MP3) ----------
  let sounds = { drop: null, clear: null, gameover: null };
  let audioUnlocked = false;

  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      sounds.drop = new Audio('drop.mp3');
      sounds.clear = new Audio('clear.mp3');
      sounds.gameover = new Audio('gameover.mp3');
      sounds.drop.load(); sounds.clear.load(); sounds.gameover.load();
      sounds.drop.volume = 0;
      sounds.drop.play().then(() => {
        sounds.drop.volume = 0.5; sounds.clear.volume = 0.5; sounds.gameover.volume = 0.5;
        audioUnlocked = true;
      }).catch(() => {});
    } catch (e) {}
    document.removeEventListener('click', unlockAudio);
    document.removeEventListener('keydown', unlockAudio);
  }
  document.addEventListener('click', unlockAudio);
  document.addEventListener('keydown', unlockAudio);

  function playSound(key) {
    if (!audioUnlocked) return;
    const sound = sounds[key];
    if (!sound) return;
    try { sound.currentTime = 0; sound.play().catch(() => {}); } catch (e) {}
  }

  // ---------- DOM ----------
  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");

  // ---------- Player Logic ----------
  class TetrisPlayer {
    constructor(id, canvasId, scoreId, linesId, livesId) {
      this.id = id;
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext("2d");
      this.scoreEl = document.getElementById(scoreId);
      this.linesEl = document.getElementById(linesId);
      this.livesEl = document.getElementById(livesId);
      
      this.lives = 3;
      this.isImmortal = false; 
      
      this.board = [];
      this.current = null;
      this.score = 0;
      this.linesCleared = 0;
      this.dropInterval = 120;
      this.dropTimer = 0;
      this.playDelay = 0;
      this.currentPlan = null;
      
      this.initLivesUI();
    }

    initLivesUI() {
      this.livesEl.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const heart = document.createElement('span');
        heart.className = 'heart';
        heart.innerHTML = '❤';
        this.livesEl.appendChild(heart);
      }
    }

    updateLivesUI() {
      const hearts = this.livesEl.querySelectorAll('.heart');
      hearts.forEach((heart, index) => {
        if (index >= this.lives) heart.classList.add('lost');
        else heart.classList.remove('lost');
      });
    }

    reset() {
      this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      this.score = 0;
      this.linesCleared = 0;
      this.lives = 3;
      this.isImmortal = false;
      this.dropTimer = 0;
      this.playDelay = 0;
      this.dropInterval = 120;
      this.current = null;
      this.updateLivesUI();
      this.spawnPiece();
      this.updateUI();
    }

    spawnPiece() {
      const type = TYPES[(Math.random() * TYPES.length) | 0];
      this.current = {
        type,
        matrix: SHAPES[type].map(r => r.slice()),
        x: Math.floor((COLS - SHAPES[type][0].length) / 2),
        y: 0
      };

      if (this.collides(this.board, this.current.matrix, this.current.x, this.current.y)) {
        this.handleOverflow();
      } else {
        this.currentPlan = this.findBestMove(this.board, this.current);
      }
    }

    handleOverflow() {
      playSound("gameover");
      
      if (!this.isImmortal) {
        this.lives--;
        this.updateLivesUI();
        
        if (this.lives === 1) {
          this.isImmortal = true;
        }
      }

      // Очищаем 4 нижние линии
      for (let i = 0; i < 4; i++) {
        this.board.pop();
        this.board.unshift(Array(COLS).fill(null));
      }
      
      this.score += 100;
      this.updateUI();
      
      this.spawnPiece();
    }

    updateUI() {
      this.scoreEl.textContent = this.score;
      this.linesEl.textContent = this.linesCleared;
    }

    // --- Bot Logic ---
    collides(b, matrix, offsetX, offsetY) {
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const x = offsetX + c;
          const y = offsetY + r;
          if (x < 0 || x >= COLS || y >= ROWS) return true;
          if (y >= 0 && b[y][x]) return true;
        }
      }
      return false;
    }

    rotate(matrix) {
      const n = matrix.length, m = matrix[0].length;
      const out = Array.from({ length: m }, () => Array(n).fill(0));
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < m; c++) {
          out[c][n - 1 - r] = matrix[r][c];
        }
      }
      return out;
    }

    boardHeights(b) {
      const heights = Array(COLS).fill(0);
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          if (b[r][c]) { heights[c] = ROWS - r; break; }
        }
      }
      return heights;
    }

    countHoles(b) {
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

    aggregateHeight(b) { return this.boardHeights(b).reduce((a, v) => a + v, 0); }

    bumpiness(b) {
      const h = this.boardHeights(b);
      let sum = 0;
      for (let i = 0; i < COLS - 1; i++) sum += Math.abs(h[i] - h[i + 1]);
      return sum;
    }

    scoreBoard(b, clearedLines) {
      let maxHeight = Math.max(...this.boardHeights(b));
      
      if (this.isImmortal && maxHeight >= 15) {
        return clearedLines * 1000 - this.countHoles(b) * 10;
      }

      return (
        -0.51 * this.aggregateHeight(b) +
        -0.35 * this.countHoles(b) +
        -0.18 * this.bumpiness(b) +
        0.76 * clearedLines
      );
    }

    simulatePlacement(b, matrix, x) {
      let y = 0;
      while (!this.collides(b, matrix, x, y + 1)) y++;
      if (this.collides(b, matrix, x, y)) return null;

      const clone = b.map((row) => row.slice());
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!matrix[r][c]) continue;
          const yy = y + r, xx = x + c;
          if (yy >= 0) clone[yy][xx] = matrix[r][c];
        }
      }
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (clone[r].every((cell) => cell)) {
          clone.splice(r, 1);
          clone.unshift(Array(COLS).fill(null));
          cleared++; r++;
        }
      }
      return { board: clone, cleared };
    }

    findBestMove(b, piece) {
      let variants = [];
      let cur = piece.matrix.map(r => r.slice());
      for (let i = 0; i < 4; i++) {
        variants.push(cur);
        cur = this.rotate(cur);
      }

      let best = null;
      variants.forEach((matrix) => {
        const width = matrix[0].length;
        for (let x = 0; x <= COLS - width; x++) {
          if (this.collides(b, matrix, x, 0)) continue;
          const sim = this.simulatePlacement(b, matrix, x);
          if (!sim) continue;
          const value = this.scoreBoard(sim.board, sim.cleared);
          if (!best || value > best.value) {
            best = { value, x, matrix };
          }
        }
      });
      return best;
    }

    applyBestMove() {
      if (!this.currentPlan) return false;
      const target = this.currentPlan;

      if (!this.matricesEqual(this.current.matrix, target.matrix)) {
        const rotated = this.rotate(this.current.matrix);
        if (!this.collides(this.board, rotated, this.current.x, this.current.y)) {
          this.current.matrix = rotated;
          return true;
        }
      }

      if (this.current.x < target.x) {
        if (!this.collides(this.board, this.current.matrix, this.current.x + 1, this.current.y)) {
          this.current.x++; return true;
        }
      } else if (this.current.x > target.x) {
        if (!this.collides(this.board, this.current.matrix, this.current.x - 1, this.current.y)) {
          this.current.x--; return true;
        }
      }

      if (!this.collides(this.board, this.current.matrix, this.current.x, this.current.y + 1)) {
        this.current.y++; return true;
      }
      return false;
    }

    matricesEqual(a, b) {
      if (a.length !== b.length || a[0].length !== b[0].length) return false;
      for (let r = 0; r < a.length; r++)
        for (let c = 0; c < a[r].length; c++)
          if (a[r][c] !== b[r][c]) return false;
      return true;
    }

    lockPiece() {
      playSound("drop");
      for (let r = 0; r < this.current.matrix.length; r++) {
        for (let c = 0; c < this.current.matrix[r].length; c++) {
          if (!this.current.matrix[r][c]) continue;
          const y = this.current.y + r;
          const x = this.current.x + c;
          if (y >= 0) this.board[y][x] = this.current.type;
        }
      }

      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (this.board[r].every((cell) => cell)) {
          this.board.splice(r, 1);
          this.board.unshift(Array(COLS).fill(null));
          cleared++; r++;
        }
      }

      if (cleared > 0) {
        playSound("clear");
        this.linesCleared += cleared;
        this.score += [0, 100, 300, 500, 800][cleared] * 10;
        this.dropInterval = Math.max(40, 120 - (this.linesCleared / 10) * 10);
        this.updateUI();
      }

      this.spawnPiece();
    }

    update(dt) {
      this.dropTimer += dt;
      this.playDelay += dt;

      if (this.playDelay >= 80) {
        this.playDelay = 0;
        const moved = this.applyBestMove();
        if (!moved) this.lockPiece();
      }

      if (this.dropTimer >= this.dropInterval) {
        this.dropTimer = 0;
        if (!this.collides(this.board, this.current.matrix, this.current.x, this.current.y + 1)) {
          this.current.y++;
        } else {
          this.lockPiece();
        }
      }
    }

    draw() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.strokeStyle = "rgba(255,255,255,0.04)";
      this.ctx.lineWidth = 1;
      for (let c = 1; c < COLS; c++) {
        this.ctx.beginPath();
        this.ctx.moveTo(c * CELL, 0);
        this.ctx.lineTo(c * CELL, this.canvas.height);
        this.ctx.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, r * CELL);
        this.ctx.lineTo(this.canvas.width, r * CELL);
        this.ctx.stroke();
      }

      const drawBlock = (x, y, color) => {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      };

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.board[r][c]) drawBlock(c, r, COLORS[this.board[r][c]]);
        }
      }

      if (this.current) {
        for (let r = 0; r < this.current.matrix.length; r++) {
          for (let c = 0; c < this.current.matrix[r].length; c++) {
            if (!this.current.matrix[r][c]) continue;
            const y = this.current.y + r;
            if (y >= 0) drawBlock(this.current.x + c, y, COLORS[this.current.type]);
          }
        }
      }
    }
  }

  // ---------- Match Control ----------
  let p1, p2;
  let paused = false;
  let lastTime = 0;

  function initMatch() {
    paused = false;
    pauseBtn.textContent = "Pause";
    lastTime = 0;

    p1 = new TetrisPlayer("p1", "board1", "score1", "lines1", "lives1");
    p2 = new TetrisPlayer("p2", "board2", "score2", "lines2", "lives2");

    p1.reset();
    p2.reset();
  }

  function gameLoop(time = 0) {
    const dt = time - lastTime;
    lastTime = time;

    if (!paused) {
      p1.update(dt);
      p2.update(dt);
    }

    p1.draw();
    p2.draw();

    requestAnimationFrame(gameLoop);
  }

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
  });

  restartBtn.addEventListener("click", initMatch);

  // Старт
  initMatch();
  requestAnimationFrame(gameLoop);
})();
