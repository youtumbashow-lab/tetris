    spawnPiece() {
      if (this.freezeTimer > 0 || this.isGameOver) return;

      // Защита от бесконечного overflow: если верхние строки заняты,
      // сначала принудительно очищаем место
      if (this.topRowsOccupied(4)) {
        this.clearTopRows(4);
      }

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

    // Проверка: заняты ли верхние `n` строк (хотя бы одна клетка)
    topRowsOccupied(n) {
      for (let r = 0; r < n && r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (this.board[r][c]) return true;
        }
      }
      return false;
    }

    // Принудительно очищает верхние `n` строк (сдвигает всё вниз)
    clearTopRows(n) {
      for (let i = 0; i < n; i++) {
        this.board.shift();
        this.board.push(Array(COLS).fill(null));
      }
    }

    handleOverflow() {
      playSound("gameover");

      this.current = null;
      this.currentPlan = null;

      if (this.isGameOver) return;

      // Списываем жизнь
      this.lives--;
      if (this.lives < 0) this.lives = 0;
      this.updateLivesUI();
      this.isImmortal = (this.lives === 1);

      if (this.lives <= 0) {
        this.isGameOver = true;
        this.updateUI();
        return;
      }

      // Штрафная очистка: гарантированно убираем 4 нижних линии
      // И дополнительно очищаем верх, чтобы новая фигура точно влезла
      for (let i = 0; i < 4; i++) {
        this.board.pop();
        this.board.unshift(Array(COLS).fill(null));
      }
      // Если верх всё ещё занят — сдвигаем вниз, пока не освободим 4 верхние строки
      let guard = 0;
      while (this.topRowsOccupied(4) && guard < ROWS) {
        this.clearTopRows(1);
        guard++;
      }

      this.score += 100;
      this.updateUI();

      this.freezeTimer = 1500;
      this.dropTimer = 0;
      this.playDelay = 0;
    }
