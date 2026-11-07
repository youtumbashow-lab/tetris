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
      const p = sounds.drop.play();
      if (p && p.then) {
        p.then(() => {
          sounds.drop.volume = 0.5; sounds.clear.volume = 0.5; sounds.gameover.volume = 0.5;
          audioUnlocked = true;
        }).catch(() => {
          // Fallback: попробовать разблокировать через AudioContext
          try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) {
              const ctx = new AC();
              if (ctx.state === 'suspended') ctx.resume().then(() => {
                sounds.drop.volume = 0.5; sounds.clear.volume = 0.5; sounds.gameover.volume = 0.5;
                audioUnlocked = true;
              }).catch(() => {});
            }
          } catch (e) {}
        });
      }
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
      this.isGameOver = false; // защита от бесконечного цикла при lives = 0
      
      this.board = [];
      this.current = null;
      this.score = 0;
      this.linesCleared = 0;
      this.dropInterval = 120;
      this.dropTimer = 0;
      this.playDelay = 0;
      this.currentPlan = null;
      
      this.freezeTimer = 0; 
      
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
      this.isGameOver = false;
      this.dropTimer = 0;
      this.playDelay = 0;
      this.dropInterval = 120;
      this.freezeTimer = 0;
      this.current = null;
      this.currentPlan = null;
      this.updateLivesUI();
      this.updateUI();
      this.spawnPiece();
    }

    spawnPiece() {
      if (this.freezeTimer > 0 || this.isGameOver) return;

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
      
      // 1. Удаляем текущую фигуру, чтобы она не вызывала бесконечную ошибку
      this.current = null; 
      this.currentPlan = null;

      // 2. Списываем жизнь
      if (!this.isImmortal) {
        this.lives--;
        this.updateLivesUI();
        
        if (this.lives === 1) {
          this.isImmortal = true;
        }
        // Защита: если жизни закончились (не должно случиться при текущей механике,
        // но на случай изменения логики) — game over
        if (this.lives <= 0) {
          this.lives = 0;
          this.isGameOver = true;
          this.updateLivesUI();
          this.updateUI();
          return;
        }
      }

      // 3. Очищаем 4 нижние линии (штрафная очистка, linesCleared не увеличиваем)
      for (let i = 0; i < 4; i++) {
        this.board.pop();
        this.board.unshift(Array(COLS).fill(null));
      }
      
      this.score += 100; 
      this.updateUI();
      
      // 4. Заморозка на 1.5 секунды + сброс таймеров,
      //    чтобы новая фигура не упала мгновенно
      this.freezeTimer = 1500;
      this.dropTimer = 0;
      this.playDelay = 0;
    }

    updateUI() {
      this.scoreEl.textContent = this.score;
      this.linesEl.textContent = this.linesCleared;
    }

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

    aggregateHeight(heights) { return heights.reduce((a, v) => a + v, 0); }

    bumpiness(heights) {
      let sum = 0;
      for (let i = 0; i < COLS - 1; i++) sum += Math.abs(heights[i] - heights[i + 1]);
      return sum;
    }

    scoreBoard(b, clearedLines) {
      const heights = this.boardHeights(b); // кэшируем один раз
      const maxHeight = Math.max(...heights);
      
      if (this.isImmortal && maxHeight >= 15) {
        return clearedLines * 1000 - this.countHoles(b) * 5;
      }

      return (
        -0.51 * this.aggregateHeight(heights) +
        -0.35 * this.countHoles(b) +
        -0.18 * this.bumpiness(heights) +
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
      if (!this.currentPlan || !this.current) return false;
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
      if (!a || !b) return false;
      if (!a.length || !b.length) return false;
      if (a.length !== b.length || a[0].length !== b[0].length) return false;
      for (let r = 0; r < a.length; r++)
        for (let c = 0; c < a[r].length; c++)
          if (a[r][c] !== b[r][c]) return false;
      return true;
    }

    lockPiece() {
      if (!this.current) return;
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
        // Упрощённая формула: 120 - linesCleared, но не менее 40
        this.dropInterval = Math.max(40, 120 - this.linesCleared);
        this.updateUI();
      }

      this.spawnPiece();
    }

    update(dt) {
      if (this.isGameOver) return;

      if (this.freezeTimer > 0) {
        this.freezeTimer -= dt;
        if (this.freezeTimer <= 0) {
          this.freezeTimer = 0;
          this.spawnPiece();
        }
        return; 
      }

      if (!this.current) return;

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
      // Используем реальные размеры canvas, а не COLS*CELL / ROWS*CELL
      const w = this.canvas.width;
      const h = this.canvas.height;
      const cellW = w / COLS;
      const cellH = h / ROWS;

      this.ctx.clearRect(0, 0, w, h);

      this.ctx.strokeStyle = "rgba(255,255,255,0.04)";
      this.ctx.lineWidth = 1;
      for (let c = 1; c < COLS; c++) {
        this.ctx.beginPath();
        this.ctx.moveTo(c * cellW, 0);
        this.ctx.lineTo(c * cellW, h);
        this.ctx.stroke();
      }
      for (let r = 1; r < ROWS; r++) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, r * cellH);
        this.ctx.lineTo(w, r * cellH);
        this.ctx.stroke();
      }

      const drawBlock = (x, y, color) => {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x * cellW, y * cellH, cellW - 1, cellH - 1);
      };

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.board[r][c]) drawBlock(c, r, COLORS[this.board[r][c]]);
        }
      }

      // Рисуем фигуру, только если она есть и мы не в заморозке
      if (this.current && this.freezeTimer <= 0 && !this.isGameOver) {
        for (let r = 0; r < this.current.matrix.length; r++) {
          for (let c = 0; c < this.current.matrix[r].length; c++) {
            if (!this.current.matrix[r][c]) continue;
            const y = this.current.y + r;
            if (y >= 0) drawBlock(this.current.x + c, y, COLORS[this.current.type]);
          }
        }
      }

      // Индикация game over
      if (this.isGameOver) {
        this.ctx.fillStyle = "rgba(0,0,0,0.6)";
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.fillStyle = "#fff";
        this.ctx.font = `bold ${Math.floor(h / 12)}px sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("GAME OVER", w / 2, h / 2);
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
